"""Bounded approved performance execution; PT-008 has no execution path."""
import asyncio
from collections import Counter
import csv
from datetime import datetime, timezone
import hashlib
from importlib.metadata import version
import json
from pathlib import Path
import platform
import socket
import subprocess
import sys
import time

ROOT=Path(__file__).resolve().parents[2]; HERE=ROOT/'testing_modules/pre_uat'
sys.path.insert(0,str(ROOT)); sys.dont_write_bytecode=True
from testing_modules.pre_uat import integration_environment as E
from testing_modules.pre_uat.performance_environment import install_guards,resources,enforce_resources,DEFAULTS
from testing_modules.pre_uat.run_phase2a import fingerprints
from testing_modules.pre_uat.performance_lifecycle import launch,ready,finish,startup_case,sanitized

IDS={'PT-004':'Concurrent upload acceptance and completed ETL throughput',
     'PT-005':'Sequential upload-to-terminal completion latency',
     'PT-006':'Mocked Python course CQI path latency',
     'PT-007':'Bounded sustained-load stability','PT-009':'Analytics throughput and p95 latency'}
BASELINE=HERE/'evidence/20261011T071933_296064Z/CONSOLIDATED_RESULTS.json'


async def execute(run_dir, environment, rows, owned):
    import httpx
    from testing_modules.pre_uat.support import SyntheticWorkbook
    from testing_modules.performance_test.controlled_workloads import Workloads
    status={'error':None,'active_test':None}; samples=[]
    guard_pids=[__import__('os').getpid(),E.ACTIVE['server_pid']]
    def guard():
        if status['error']: raise E.PrerequisiteBlocked(status['error'])
        if E.ACTIVE['network_violations']: raise E.PrerequisiteBlocked('Unexpected network attempt')
    async def monitor():
        previous=None
        while True:
            try:
                snapshot=await asyncio.to_thread(resources,guard_pids)
                enforce_resources(snapshot)
                snapshot.update(monotonic=time.perf_counter(),timestamp=datetime.now(timezone.utc).isoformat(),test_id=status['active_test'],
                    queue_depth=E.ACTIVE['client'].llen(E.ACTIVE['queue_prefix']+'job_queue'))
                if previous:
                    dt=snapshot['monotonic']-previous['monotonic']
                    for pid,p in snapshot['processes'].items():
                        p['cpu_percent_one_core']=100*(p['cpu_seconds']-previous['processes'][pid]['cpu_seconds'])/dt
                # Only the positively identified owned container is sampled.
                label=await asyncio.to_thread(E.docker,'inspect','--format','{{index .Config.Labels "obelisk.preuat.run"}}',E.ACTIVE['container'])
                if label!=E.ACTIVE['nonce']: raise E.PrerequisiteBlocked('Resource container ownership changed')
                raw=await asyncio.to_thread(E.docker,'stats','--no-stream','--format','{{json .}}',E.ACTIVE['container'])
                container=json.loads(raw)
                snapshot['owned_redis']={k:container.get(k) for k in ('CPUPerc','MemUsage','MemPerc','PIDs')}
                samples.append(snapshot); previous=snapshot
                (run_dir/'RESOURCE_SAMPLES.json').write_text(json.dumps(samples,indent=2),encoding='utf-8')
            except Exception as exc:
                status['error']='Resource/isolation safety stop: '+type(exc).__name__
                return
            await asyncio.sleep(3)
    async with httpx.AsyncClient(base_url=f"http://127.0.0.1:{E.ACTIVE['api_port']}",trust_env=False,
            timeout=30,limits=httpx.Limits(max_connections=10,max_keepalive_connections=10)) as client:
        await ready(client,owned)
        # Prove rejection without actually connecting to the blocked address.
        for address in [('127.0.0.1',6379),('203.0.113.1',443)]:
            with socket.socket() as probe:
                try: probe.connect(address)
                except E.PrerequisiteBlocked: pass
                else: raise E.PrerequisiteBlocked('Network deny guard self-check failed')
        E.ACTIVE['guard_self_checks']=list(E.ACTIVE['network_violations'])
        E.ACTIVE['network_violations'].clear()
        watcher=asyncio.create_task(monitor())
        await asyncio.sleep(.05)
        try:
            with SyntheticWorkbook(students=30,clos=5,scenario='mixed') as fixture:
                fixture_hash=hashlib.sha256(fixture.path.read_bytes()).hexdigest()
                (run_dir/'FIXTURE_MANIFEST.json').write_text(json.dumps({'sha256':fixture_hash,'size_bytes':fixture.path.stat().st_size,
                    'students':30,'clos':5,'unique_records':150,'scenario':'mixed','synthetic':True}),encoding='utf-8')
                workload=Workloads(client,fixture,guard)
                for test_id,objective in IDS.items():
                    status['active_test']=test_id
                    row={'test_id':test_id,'objective':objective,'timestamp':datetime.now(timezone.utc).isoformat(),
                         'scenario':'Approved fixed local workload; synthetic 30x5 workbook or anonymized ETL-derived analytics',
                         'expected':'All functional assertions pass, correct numerical outputs, no HTTP errors, terminal completion and verified isolation/cleanup; no numeric performance SLA',
                         'status':'PASS','executed':False,'environment':environment,'script_function':'testing_modules.performance_test.controlled_workloads.Workloads.'+test_id.lower().replace('-',''),
                         'failures':[],'fixture_sha256':fixture_hash}
                    start=time.perf_counter(); offset=len(workload.http)
                    try:
                        guard(); row['executed']=True
                        row['actual']=await asyncio.wait_for(getattr(workload,test_id.lower().replace('-',''))(),timeout=260 if test_id=='PT-007' else 180)
                        if test_id in {'PT-004','PT-005','PT-007'}:
                            for batch in row['actual']['batches']:
                                assert batch['requests']==batch['accepted']==batch['completed']
                                assert batch['failed']==batch['rejected']==batch['unfinished']==batch['final_queue_depth']==0
                        if test_id=='PT-007':
                            records=row['actual']['batches'][0]['records']
                            assert len(records)<=60 and all(b['dispatch']-a['dispatch']>=1.999 for a,b in zip(records,records[1:]))
                        guard()
                    except Exception as exc:
                        row['status']='BLOCKED' if isinstance(exc,E.PrerequisiteBlocked) else 'FAIL'
                        row['failures']=[type(exc).__name__+': '+str(exc) if isinstance(exc,(AssertionError,E.PrerequisiteBlocked)) else type(exc).__name__]
                    row['duration_seconds']=time.perf_counter()-start
                    requests=workload.http[offset:]
                    row['http_observations']={'total_including_polling':len(requests),
                        'status_counts':dict(Counter(str(r['status']) for r in requests)),
                        'error_rate':sum(r['status'] is None or r['status']>=400 for r in requests)/len(requests) if requests else None}
                    row['resource_sample_range']=[s for s in samples if s['test_id']==test_id]
                    row['performance_acceptance']='NOT ASSESSED: no documented latency or throughput threshold'
                    rows.append(row)
                    (run_dir/(test_id+'_http.json')).write_text(json.dumps(requests,indent=2),encoding='utf-8')
                    (run_dir/(test_id+'_result.txt')).write_text(json.dumps(row,indent=2),encoding='utf-8')
                    print(test_id+': '+row['status'],flush=True)
                    if row['status']!='PASS': break
                status['active_test']=None
        finally:
            watcher.cancel(); await asyncio.gather(watcher,return_exceptions=True)
            (run_dir/'RESOURCE_SAMPLES.json').write_text(json.dumps(samples,indent=2),encoding='utf-8')
            try:
                stopped=await client.post('/__pre_uat/shutdown',json={'nonce':E.ACTIVE['nonce']})
                assert stopped.json()['nonce']==E.ACTIVE['nonce']
            except Exception: E.ACTIVE['server_shutdown_request_failed']=True


def reports(run_dir, rows, environment, before, after, command):
    for test_id,objective in IDS.items():
        if not any(r['test_id']==test_id for r in rows):
            rows.append({'test_id':test_id,'objective':objective,'scenario':'Approved bounded workload',
                'expected':'Verified prerequisites before execution','actual':E.ACTIVE.get('blocker','Earlier test stopped execution'),
                'status':'BLOCKED','executed':False,'timestamp':datetime.now(timezone.utc).isoformat(),'environment':environment,
                'script_function':'testing_modules.performance_test.controlled_workloads.Workloads.'+test_id.lower().replace('-',''),
                'failures':[E.ACTIVE.get('blocker','Earlier test stopped execution')]})
    for row in rows:
        row['command']=command
        row['evidence_path']=(run_dir/(row['test_id']+'_result.txt')).relative_to(ROOT).as_posix()
        (ROOT/row['evidence_path']).write_text(json.dumps(row,indent=2),encoding='utf-8')
    changed=[p for p in before.keys()|after.keys() if before.get(p)!=after.get(p)]
    source_files=[HERE/'performance_environment.py',HERE/'performance_server.py',HERE/'run_phase2b2.py',ROOT/'testing_modules/performance_test/controlled_workloads.py']
    manifest={'before':before,'after':after,'changed_protected_files':changed,'harness_sources':{p.relative_to(ROOT).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in source_files}}
    (run_dir/'SOURCE_MANIFEST.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
    (run_dir/'ISOLATION.json').write_text(json.dumps(E.proof(),indent=2),encoding='utf-8')
    (run_dir/'RESULTS.json').write_text(json.dumps({'phase':'2B-2','counts':dict(Counter(r['status'] for r in rows)),
        'executed_ids':sum(r['executed'] for r in rows),'environment':environment,'command':command,'rows':rows},indent=2),encoding='utf-8')
    previous=json.loads(BASELINE.read_text(encoding='utf-8'))['rows']
    combined=[r for r in previous if r['test_id'] not in IDS]+rows
    for row in combined:
        if row['test_id']=='PT-008':
            row=dict(row); row.update(status='SKIPPED',executed=False,actual='Queue saturation explicitly not approved; not executed')
            combined[combined.index(next(r for r in combined if r['test_id']=='PT-008'))]=row
            break
    (run_dir/'CONSOLIDATED_RESULTS.json').write_text(json.dumps({'prior_source':str(BASELINE.relative_to(ROOT)),
        'previous_20_pass_timestamps_preserved':True,'counts':dict(Counter(r['status'] for r in combined)),'rows':combined},indent=2),encoding='utf-8')
    fields=['test_id','objective','scenario','expected','actual','status','executed','timestamp','duration_seconds','environment','script_function','command','evidence_path','failures']
    with (HERE/'PRE_UAT_RESULTS.csv').open('w',encoding='utf-8-sig',newline='') as stream:
        writer=csv.DictWriter(stream,fieldnames=fields,extrasaction='ignore'); writer.writeheader()
        for row in combined: writer.writerow({k:json.dumps(v) if isinstance(v,(dict,list)) else v for k,v in row.items()})
    lines=['# OBELISK consolidated Pre-UAT results — Phase 2B-2','',
        f"Run {run_dir.name}; consolidated counts: {dict(Counter(r['status'] for r in combined))}.",'',
        'The prior 20 PASS results retain their original timestamps and evidence. They were not rerun. PT-008 was not executed.',
        '', 'PASS denotes functional assertions and isolation/cleanup. Performance acceptance is NOT ASSESSED because no numeric SLA is documented.',
        '', '[Performance execution instructions](PERFORMANCE_README.md)', '', '```powershell',command,'```','',
        f'[Execution evidence](evidence/{run_dir.name}/RESULTS.json), [resources](evidence/{run_dir.name}/RESOURCE_SAMPLES.json), [ownership/cleanup](evidence/{run_dir.name}/ISOLATION.json), [source hashes](evidence/{run_dir.name}/SOURCE_MANIFEST.json).','']
    for title,prefix in [('Unit','UT-'),('Integration','IT-'),('AI System','ST-AI-'),('Performance','PT-')]:
        lines += ['## '+title,'','| ID | Status | Original execution timestamp | Evidence |','| --- | --- | --- | --- |']
        for row in combined:
            if row['test_id'].startswith(prefix): lines.append(f"| {row['test_id']} | {row['status']} | {row['timestamp']} | [result]({row['evidence_path'].replace('testing_modules/pre_uat/','')}) |")
        lines.append('')
    for row in rows:
        lines += [f"### {row['test_id']}",'',f"Functional status: {row['status']}. {row.get('failures',[])}",'']
        actual=row.get('actual')
        if isinstance(actual,dict):
            for batch in actual.get('batches',[actual]):
                brief={k:v for k,v in batch.items() if k not in {'records','valid_recommendation'}}
                lines += ['```json',json.dumps(brief,indent=2),'```','']
    (HERE/'PRE_UAT_RESULTS.md').write_text('\n'.join(lines),encoding='utf-8')
    audit=HERE/'COVERAGE_AUDIT.md'
    preface=['# Current Phase 2B-2 performance coverage','',f'Execution record: {run_dir.name}. Historical scripts and earlier audit snapshots are preserved below.','',
             '| ID | Current coverage | Evidence |','| --- | --- | --- |']
    for row in rows:
        classification='NEW VERIFIED functional checks; benchmark measured, no SLA' if row['status']=='PASS' else row['status']+'; not verified'
        preface.append(f"| {row['test_id']} | {classification} | [result](evidence/{run_dir.name}/{row['test_id']}_result.txt) |")
    preface += ['| PT-008 | SKIPPED: execution not approved | No new execution evidence |','',
                'PT-006 covers the mocked Python AI path only; live Gemini latency remains unverified. Local host results do not certify production capacity.','', '---','']
    audit.write_text('\n'.join(preface)+audit.read_text(encoding='utf-8'),encoding='utf-8')


def main():
    startup_only=sys.argv[1:]==['--startup-only']
    if startup_only: return diagnostic_main()
    if sys.argv[1:]!=['--approved-bounded-run']:
        raise SystemExit('Select --startup-only or separately approved --approved-bounded-run')
    run_dir=HERE/'evidence'/datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S_%fZ'); run_dir.mkdir(parents=True)
    before=fingerprints(); rows=[]; child=None; owned=None
    environment={'phase':'2B-2','python':platform.python_version(),'interpreter':sys.executable,'platform':platform.platform(),
        'configuration':DEFAULTS,'HTTP':'owned separate Uvicorn process; loopback TCP','Redis':'fresh owned labelled container',
        'Gemini':'mocked; client construction and external sockets denied','database':'denied','request_timeout_seconds':30,
        'post_submission_drain_seconds':120,'resource_guard':'1 GiB minimum free RAM/disk; 1 GiB maximum owned Python working set',
        'p95':'nearest rank: sorted[ceil(0.95*n)-1]','PT-008':'not approved; no execution path'}
    command=f"& '{sys.executable}' -B testing_modules/pre_uat/run_phase2b2.py --approved-bounded-run"
    try:
        environment['packages']={name:version(name) for name in ['uvicorn','fastapi','httpx','redis','openpyxl','pydantic','google-genai']}
        initial=resources([__import__('os').getpid()]); enforce_resources(initial); environment['resource_preflight']=initial
        cpu_snapshot=subprocess.run(['powershell','-NoProfile','-NonInteractive','-Command',
            'Get-CimInstance Win32_Processor | Select-Object Name,NumberOfCores,NumberOfLogicalProcessors,LoadPercentage | ConvertTo-Json -Compress'],capture_output=True,text=True,timeout=20)
        if cpu_snapshot.returncode: raise E.PrerequisiteBlocked('Host CPU preflight unavailable')
        environment['cpu_preflight']=json.loads(cpu_snapshot.stdout)
        if environment['cpu_preflight']['LoadPercentage']>=90:
            raise E.PrerequisiteBlocked('Host CPU preflight at least 90 percent; postpone benchmarks')
        with socket.socket() as reservation:
            reservation.bind(('127.0.0.1',0)); E.ACTIVE['api_port']=reservation.getsockname()[1]
        E.install_guards=install_guards
        E.prepare(run_dir); E.ACTIVE['phase']='2B-2'
        config={k:E.ACTIVE[k] for k in ('nonce','api_port','redis_port','redis_run_id')}
        config.update(run_dir=str(run_dir),upload_folder=str(E.ACTIVE['upload_folder']))
        config_path=run_dir/'OWNED_SERVER_CONFIG.json'; config_path.write_text(json.dumps(config),encoding='utf-8')
        owned=launch(config_path,run_dir); child=owned['child']
        E.ACTIVE['server_pid']=child.pid
        asyncio.run(execute(run_dir,environment,rows,owned))
    except Exception as exc:
        E.ACTIVE['startup_error']=sanitized(exc)
        E.ACTIVE['blocker']=E.ACTIVE['startup_error'].get('reason','Prerequisite/harness failure: '+type(exc).__name__)
    finally:
        if owned:
            cleanup_report=finish(owned)
            E.ACTIVE['process_cleanup']=cleanup_report
            if cleanup_report['cleanup_errors']: E.ACTIVE['cleanup_error']='Owned server cleanup proof failed'
        try: E.cleanup()
        except Exception as exc: E.ACTIVE['cleanup_error']='Owned Redis/temp cleanup failed: '+type(exc).__name__
    after=fingerprints()
    if before!=after or E.ACTIVE['network_violations'] or E.ACTIVE.get('cleanup_error'):
        E.ACTIVE.setdefault('blocker',E.ACTIVE.get('cleanup_error','Protected files or network guards changed'))
        for row in rows:
            row['status']='BLOCKED'; row['failures'].append(E.ACTIVE['blocker'])
    reports(run_dir,rows,environment,before,after,command)
    print('Phase 2B-2: '+json.dumps(dict(Counter(r['status'] for r in rows))),flush=True)
    print('Evidence: '+str(run_dir.relative_to(ROOT)),flush=True)
    return 2 if any(r['status']=='BLOCKED' for r in rows) else 1 if any(r['status']=='FAIL' for r in rows) else 0


def diagnostic_main():
    """No import or call of workload modules; no consolidated-result rewrite."""
    run_dir=HERE/'evidence'/datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S_%fZ')
    run_dir.mkdir(parents=True)
    before=fingerprints(); outcomes=[]; error=None
    try:
        snapshot=resources([__import__('os').getpid()]); enforce_resources(snapshot)
        (run_dir/'RESOURCE_PREFLIGHT.json').write_text(json.dumps(snapshot,indent=2),encoding='utf-8')
        with socket.socket() as reservation:
            reservation.bind(('127.0.0.1',0)); E.ACTIVE['api_port']=reservation.getsockname()[1]
        E.install_guards=install_guards
        E.prepare(run_dir); E.ACTIVE['phase']='startup-only diagnostic'
        config={k:E.ACTIVE[k] for k in ('nonce','api_port','redis_port','redis_run_id')}
        config['upload_folder']=str(E.ACTIVE['upload_folder'])
        normal=asyncio.run(startup_case(run_dir/'normal_startup',config))
        outcomes.append(normal)
        if normal['status']!='PASS':
            raise E.PrerequisiteBlocked('Normal startup diagnostic failed; no retry or failure-path subprocess started')
        if E.ACTIVE['client'].dbsize()!=0 or list(E.ACTIVE['upload_folder'].iterdir()):
            raise E.PrerequisiteBlocked('Startup-only mode unexpectedly created job/upload data')
        failure=asyncio.run(startup_case(run_dir/'intentional_failure',config,intentional=True))
        outcomes.append(failure)
        if failure['status']!='PASS': raise E.PrerequisiteBlocked('Controlled failure-path assertions failed')
        assert E.ACTIVE['client'].dbsize()==0 and not list(E.ACTIVE['upload_folder'].iterdir())
    except Exception as exc: error=sanitized(exc)
    finally:
        try: E.cleanup()
        except Exception as exc: E.ACTIVE['diagnostic_cleanup_error']=sanitized(exc)
    after=fingerprints()
    status='PASS' if error is None and not E.ACTIVE.get('diagnostic_cleanup_error') and before==after and not E.ACTIVE['network_violations'] else 'BLOCKED'
    result={'mode':'startup-only','status':status,'timestamp':datetime.now(timezone.utc).isoformat(),'startup_error':error,
        'cases':outcomes,'workload_requests':0,'performance_ids':'unchanged: five BLOCKED; PT-008 SKIPPED',
        'prior_evidence_untouched':True,'command':f"& '{sys.executable}' -B testing_modules/pre_uat/run_phase2b2.py --startup-only"}
    (run_dir/'DIAGNOSTIC_RESULTS.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
    (run_dir/'ISOLATION.json').write_text(json.dumps(E.proof(),indent=2),encoding='utf-8')
    sources=[HERE/name for name in ('performance_environment.py','performance_server.py','performance_lifecycle.py','run_phase2b2.py')]
    (run_dir/'SOURCE_MANIFEST.json').write_text(json.dumps({'before':before,'after':after,'protected_unchanged':before==after,
        'harness_sources':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in sources}},indent=2),encoding='utf-8')
    print('Startup-only diagnostic: '+status,flush=True)
    print('Evidence: '+str(run_dir.relative_to(ROOT)),flush=True)
    return 0 if status=='PASS' else 2

if __name__=='__main__': raise SystemExit(main())

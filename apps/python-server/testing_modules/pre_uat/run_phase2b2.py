"""Bounded approved performance execution; PT-008 has no execution path."""
import asyncio
from collections import Counter
import csv
from datetime import datetime, timezone
import hashlib
import os
from importlib.metadata import version
import json
from pathlib import Path
import platform
import shutil
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
    raise E.PrerequisiteBlocked('Full PT workloads disabled pending separate authorization and review')
    # Prepared implementation retained for later review; unreachable in remediation.
    import httpx
    from testing_modules.pre_uat.support import SyntheticWorkbook
    from testing_modules.performance_test.controlled_workloads import Workloads
    status={'error':None,'active_test':None}; samples=[]
    guard_pids=[os.getpid()]
    def guard():
        if status['error']: raise E.PrerequisiteBlocked(status['error'])
        if E.ACTIVE['network_violations']: raise E.PrerequisiteBlocked('Unexpected network attempt')
    async def monitor():
        previous=None
        while True:
            try:
                snapshot=await asyncio.to_thread(resources,guard_pids,owned=owned['process'])
                enforce_resources(snapshot)
                snapshot.update(monotonic=time.perf_counter(),timestamp=datetime.now(timezone.utc).isoformat(),test_id=status['active_test'],
                    queue_depth=E.ACTIVE['client'].llen(E.ACTIVE['queue_prefix']+'job_queue'))
                if previous:
                    dt=snapshot['monotonic']-previous['monotonic']
                    for pid,p in snapshot['processes'].items():
                        p['cpu_percent_one_core']=100*(p['cpu_seconds']-previous['processes'][pid]['cpu_seconds'])/dt
                # Only the positively identified owned container is sampled.
                container_id=await asyncio.to_thread(E.verify_container)
                raw=await asyncio.to_thread(E.docker,'stats','--no-stream','--format','{{json .}}',container_id)
                container=json.loads(raw)
                snapshot['owned_redis']={k:container.get(k) for k in ('CPUPerc','MemUsage','MemPerc','PIDs')}
                samples.append(snapshot); previous=snapshot
                (run_dir/'RESOURCE_SAMPLES.json').write_text(json.dumps(samples,indent=2),encoding='utf-8')
            except Exception as exc:
                status['error']='Resource/isolation safety stop: '+type(exc).__name__
                return
            await asyncio.sleep(3)
    async with httpx.AsyncClient(base_url=f"http://127.0.0.1:{E.ACTIVE['api_port']}",trust_env=False,
            timeout=30,headers={'Authorization':'Bearer '+E.ACTIVE['nonce']},
            limits=httpx.Limits(max_connections=10,max_keepalive_connections=10)) as client:
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


HARNESS_NAMES = ('windows_owned_process.py', 'performance_lifecycle.py',
                 'performance_environment.py', 'performance_server.py',
                 'integration_environment.py', 'run_phase2b2.py')


def source_hashes():
    return {name: hashlib.sha256((HERE/name).read_bytes()).hexdigest() for name in HARNESS_NAMES}


def saved_hashes():
    paths = [p for p in (HERE/'evidence').rglob('*') if p.is_file()]
    paths += [HERE/'PRE_UAT_RESULTS.md', HERE/'PRE_UAT_RESULTS.csv']
    return {p.relative_to(ROOT).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in paths}


def preflight(run_dir):
    """Read-only local metadata before ANY container/API creation."""
    if sys.platform != 'win32':
        raise E.PrerequisiteBlocked('Diagnostics require Windows')
    snapshot = resources([os.getpid()])
    enforce_resources(snapshot)
    command = """
$ErrorActionPreference='Stop'
$processes=@(Get-CimInstance Win32_Process | Where-Object {
    $_.Name -match '^(python.*|uvicorn.*|redis.*|postgres.*|docker.*|com.docker.*|bun|node)\\.exe$'
} | Select-Object ProcessId,ParentProcessId,Name)
$ports=@(Get-NetTCPConnection | Where-Object {
    $_.State -eq 'Listen' -or $_.RemotePort -in @(5432,6379,8000)
} | Select-Object LocalAddress,LocalPort,RemoteAddress,RemotePort,State,OwningProcess)
$cpu=Get-CimInstance Win32_Processor | Select-Object LoadPercentage
$names=@(Get-ChildItem Env: | Where-Object {
    $_.Name -match 'OBELISK|REDIS|DATABASE|GEMINI|GOOGLE|DOTENV|PROXY'
} | Select-Object -ExpandProperty Name)
@{processes=$processes;ports=$ports;cpu=$cpu;environment_variable_names_only=$names} | ConvertTo-Json -Depth 5 -Compress
"""
    inspected = subprocess.run(['powershell', '-NoProfile', '-NonInteractive', '-Command', command],
                               capture_output=True, text=True, timeout=20,
                               creationflags=subprocess.CREATE_NO_WINDOW)
    if inspected.returncode:
        raise E.PrerequisiteBlocked('Read-only host preflight failed')
    host = json.loads(inspected.stdout)
    if any(c['LoadPercentage'] is None or c['LoadPercentage'] >= 90
           for c in ([host['cpu']] if isinstance(host['cpu'], dict) else host['cpu'])):
        raise E.PrerequisiteBlocked('Host CPU observation unavailable or at least 90 percent')
    E.ACTIVE.update(docker=shutil.which('docker'), docker_host=E.DOCKER_HOST)
    if not E.ACTIVE['docker']:
        raise E.PrerequisiteBlocked('Docker CLI unavailable')
    host['docker_engine'] = E.docker('info', '--format', '{{.OSType}} {{.ServerVersion}}')
    if not host['docker_engine'].startswith('linux '):
        raise E.PrerequisiteBlocked('Local Linux engine required')
    host['containers'] = E.docker('ps', '--all', '--format',
                                '{{.ID}}|{{.Names}}|{{.Image}}|{{.Status}}|{{.Ports}}').splitlines()
    host['resource_observation'] = snapshot
    host['runtime_environment'] = 'Root env not loaded/decrypted; child credentials stripped; imports guarded'
    (run_dir/'PREFLIGHT.json').write_text(json.dumps(host, indent=2), encoding='utf-8')
    return host


def validate_smoke_gate(path):
    source = Path(path).resolve()
    if not source.is_relative_to(HERE/'evidence') or source.is_symlink() or source.is_junction():
        raise E.PrerequisiteBlocked('Smoke prerequisite must be saved local diagnostic evidence')
    result = json.loads((source/'DIAGNOSTIC_RESULTS.json').read_text(encoding='utf-8'))
    isolation = json.loads((source/'ISOLATION.json').read_text(encoding='utf-8'))
    manifest = json.loads((source/'SOURCE_MANIFEST.json').read_text(encoding='utf-8'))
    if (result.get('mode') != 'startup-only' or result.get('status') != 'PASS'
            or result.get('workload_requests') != 0 or result.get('smoke_requests') != 0
            or not manifest.get('protected_unchanged') or not manifest.get('historical_unchanged')
            or manifest.get('harness_sources') != source_hashes()
            or not all(isolation.get(k) is True for k in
                       ('redis_empty_verified', 'container_removed_verified', 'scratch_removed_verified'))
            or isolation.get('resource_cleanup_errors') != []):
        raise E.PrerequisiteBlocked('Prior normal/failure diagnostic and complete cleanup proof required')
    cases = result.get('cases', [])
    if len(cases) != 2 or [c.get('intentional_failure') for c in cases] != [False, True]:
        raise E.PrerequisiteBlocked('Both normal and intentional-failure cases required')
    for case in cases:
        cleanup = case.get('cleanup', {})
        if (case.get('status') != 'PASS' or cleanup.get('job_active_processes') != 0
                or cleanup.get('retained_processes_exited') is not True
                or cleanup.get('forced_termination') or cleanup.get('cleanup_errors')):
            raise E.PrerequisiteBlocked('Prior case cleanup proof incomplete')
    if not cases[0]['cleanup'].get('graceful_workers_verified'):
        raise E.PrerequisiteBlocked('Prior graceful workers not verified')
    return source


async def smoke_request(client):
    """Exactly ONE synthetic analytics POST; no ETL fixture, queue job or provider."""
    header = dict(course_code='SMOKE-101', course_title='Synthetic smoke',
                  course_type='LECTURE', section='Synthetic', semester_year='Synthetic',
                  instructor_name=None, no_of_students=2, threshold=.70, grading_system=None)
    attainments = [
        dict(student_id=None, student_name='Student '+letter, clo_code='CLO1',
             direct_clo_attainment_pct=value, indirect_clo_attainment_pct=None,
             composite_clo_attainment_pct=None, met_threshold=value >= .70,
             clo_level='Proficient' if value >= .70 else 'Basic',
             is_record_complete=True, section_completeness_pct=1.0, rule1_met=True)
        for letter, value in [('A', .6), ('B', .8)]]
    payload = dict(period=dict(type='custom', label='Synthetic diagnostic'),
        submissions=[dict(department='Synthetic Department', program='Synthetic Program',
                          avp_group='Synthetic AVP', course_code='SMOKE-101', section='Synthetic',
                          header=header, attainments=attainments,
                          clo_plo_mapping=[dict(clo_code='CLO1', plo_code='PLO1', correlation_strength=3)])])
    started = time.perf_counter()
    row = dict(status='FAIL', executed=True, request_count=1,
               objective='Single diagnostic analytics request; no PT acceptance',
               expected=dict(records=2, clo_mean=.7, plo_mean=.7, program_mean=.7))
    try:
        response = await client.post('/analytics/summary', json=payload, timeout=10)
        row['elapsed_seconds'] = time.perf_counter()-started
        row['http_status'] = response.status_code
        row['actual'] = response.json()
        assert response.status_code == 200, 'Smoke response is not HTTP 200'
        body = row['actual']
        for level, name in [('department_summary','Synthetic Department'),
                            ('program_summary','Synthetic Program'),
                            ('avp_group_summary','Synthetic AVP')]:
            group = body[level][name]
            assert group['total_attainment_records'] == 2
            assert set(group['clos']) == {'CLO1'} and set(group['plos']) == {'PLO1'}
            clo, plo = group['clos']['CLO1'], group['plos']['PLO1']
            assert clo['record_count'] == 2 and clo['rule1_met'] is True
            assert abs(clo['mean_attainment_pct'] - (.6+.8)/2) < 1e-12
            assert abs(plo['plo_attainment_direct_only'] - .7) < 1e-12
            assert plo['plo_rule3_met'] is True and plo['plo_completeness_pct'] == 1
            if level == 'program_summary':
                assert abs(group['program_plo_average'] - .7) < 1e-12
        row['status'] = 'PASS'
    except Exception as exc:
        row['elapsed_seconds'] = time.perf_counter()-started
        row['failure'] = sanitized(exc)
    return row


def main():
    if sys.argv[1:] == ['--startup-only']:
        return diagnostic_main()
    if len(sys.argv) == 3 and sys.argv[1] == '--smoke-after':
        return diagnostic_main(smoke_source=sys.argv[2])
    raise SystemExit('Full PT workloads disabled. Select --startup-only or --smoke-after <verified diagnostic directory>; separate approval required.')


def diagnostic_main(smoke_source=None):
    """No workload imports/calls or consolidated-result writes in either mode."""
    mode = 'smoke-only' if smoke_source is not None else 'startup-only'
    # Validate before making a new directory or resource.
    prior = validate_smoke_gate(smoke_source) if smoke_source is not None else None
    history_before = saved_hashes()
    before = fingerprints()
    run_dir = HERE/'evidence'/(datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S_%fZ')+'_'+mode)
    run_dir.mkdir()
    command = f"& '{sys.executable}' -B testing_modules/pre_uat/run_phase2b2.py "
    command += '--startup-only' if prior is None else f"--smoke-after '{prior}'"
    outcomes = []
    error = None
    git_commit = None
    try:
        git = subprocess.run(['git', 'rev-parse', 'HEAD'], cwd=ROOT,
                             capture_output=True, text=True, timeout=10)
        if git.returncode:
            raise E.PrerequisiteBlocked('Git provenance unavailable')
        git_commit = git.stdout.strip()
        preflight(run_dir)
        with socket.socket() as reservation:
            reservation.bind(('127.0.0.1',0))
            E.ACTIVE['api_port'] = reservation.getsockname()[1]
        E.install_guards = install_guards
        E.prepare(run_dir)
        E.ACTIVE['phase'] = mode+' harness remediation'
        config = {k:E.ACTIVE[k] for k in ('nonce','api_port','redis_port','redis_run_id','queue_prefix')}
        config.update(upload_folder=str(E.ACTIVE['upload_folder']),
                      scratch_root=str(E.ACTIVE['scratch_root']), owned_run_dir=str(run_dir))
        if prior is None:
            normal = asyncio.run(startup_case(run_dir/'normal_startup', config))
            outcomes.append(normal)
            if normal['status'] != 'PASS':
                raise E.PrerequisiteBlocked('Normal lifecycle failed; no second API launched')
            if E.ACTIVE['client'].dbsize() or list(E.ACTIVE['upload_folder'].iterdir()):
                raise E.PrerequisiteBlocked('Startup diagnostic unexpectedly created data')
            failure = asyncio.run(startup_case(run_dir/'intentional_failure', config, intentional=True))
            outcomes.append(failure)
            if failure['status'] != 'PASS':
                raise E.PrerequisiteBlocked('Intentional-failure lifecycle cleanup failed')
        else:
            smoke = asyncio.run(startup_case(run_dir/'smoke', config, smoke=smoke_request))
            outcomes.append(smoke)
            if smoke['status'] != 'PASS' or smoke['cleanup'].get('mock_calls') != 0:
                raise E.PrerequisiteBlocked('Smoke response, cleanup, or zero-provider-call proof failed')
        if E.ACTIVE['client'].dbsize() or list(E.ACTIVE['upload_folder'].iterdir()):
            raise E.PrerequisiteBlocked('Diagnostic/smoke unexpectedly created job/upload data')
    except Exception as exc:
        error = sanitized(exc)
    finally:
        try:
            E.cleanup()
        except Exception as exc:
            E.ACTIVE['diagnostic_cleanup_error'] = sanitized(exc)
    after = fingerprints()
    history_after = {p:hashlib.sha256((ROOT/p).read_bytes()).hexdigest()
                     if (ROOT/p).is_file() else None for p in history_before}
    unchanged = before == after and history_before == history_after
    status = ('PASS' if error is None and not E.ACTIVE.get('diagnostic_cleanup_error')
              and unchanged and not E.ACTIVE['network_violations'] else 'BLOCKED')
    result = dict(mode=mode, status=status, timestamp=datetime.now(timezone.utc).isoformat(),
                  git_commit=git_commit, startup_error=error, cases=outcomes,
                  workload_requests=0, smoke_requests=sum(c.get('smoke_executed',False) for c in outcomes),
                  performance_ids='UNCHANGED; no PT ID executed or marked PASS',
                  prior_diagnostic=str(prior) if prior else None,
                  prior_evidence_untouched=history_before == history_after, command=command)
    (run_dir/'DIAGNOSTIC_RESULTS.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
    (run_dir/'ISOLATION.json').write_text(json.dumps(E.proof(),indent=2),encoding='utf-8')
    manifest = dict(git_commit=git_commit, before=before, after=after,
                    protected_unchanged=before == after, historical_unchanged=history_before == history_after,
                    historical_before=history_before, historical_after=history_after,
                    harness_sources=source_hashes())
    (run_dir/'SOURCE_MANIFEST.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
    if prior is not None:
        smoke_result = outcomes[0].get('smoke',dict(status='SKIPPED',executed=False)) if outcomes else dict(status='SKIPPED',executed=False)
        (run_dir/'SMOKE_RESULT.json').write_text(json.dumps(smoke_result,indent=2),encoding='utf-8')
    lines = ['HARNESS '+mode+': '+status,
             'Full PT workloads: NOT EXECUTED; institutional statuses unchanged',
             'Smoke requests: '+str(result['smoke_requests']),
             'Evidence: '+str(run_dir.relative_to(ROOT))]
    (run_dir/'TERMINAL_SUMMARY.txt').write_text('\n'.join(lines)+'\n',encoding='utf-8')
    for line in lines:
        print(line,flush=True)
    return 0 if status == 'PASS' else 2


if __name__ == '__main__':
    raise SystemExit(main())

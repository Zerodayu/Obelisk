"""Subprocess ownership, bounded readiness, and always-run cleanup."""
import asyncio
import ctypes
import json
from pathlib import Path
import subprocess
import sys
import time
import traceback
from testing_modules.pre_uat import integration_environment as E
from testing_modules.pre_uat.performance_environment import DEFAULTS

def sanitized(exc):
    result={'type':type(exc).__name__,'frames':[{'file':Path(f.filename).name,'line':f.lineno,'function':f.name} for f in traceback.extract_tb(exc.__traceback__)]}
    if isinstance(exc,E.PrerequisiteBlocked): result['reason']=str(exc)
    return result

class Basic(ctypes.Structure):
    _fields_=[('process_time',ctypes.c_int64),('job_time',ctypes.c_int64),('flags',ctypes.c_ulong),('minimum',ctypes.c_size_t),('maximum',ctypes.c_size_t),('active_limit',ctypes.c_ulong),('affinity',ctypes.c_size_t),('priority',ctypes.c_ulong),('scheduling',ctypes.c_ulong)]
class Limits(ctypes.Structure):
    _fields_=[('basic',Basic),('io',ctypes.c_uint64*6),('process_memory',ctypes.c_size_t),('job_memory',ctypes.c_size_t),('peak_process',ctypes.c_size_t),('peak_job',ctypes.c_size_t)]

def launch(config_path, run_dir):
    """Kill-on-close Windows job contains only this freshly created process tree."""
    k=ctypes.windll.kernel32
    k.CreateJobObjectW.restype=ctypes.c_void_p
    k.SetInformationJobObject.argtypes=[ctypes.c_void_p,ctypes.c_int,ctypes.c_void_p,ctypes.c_ulong]
    k.AssignProcessToJobObject.argtypes=[ctypes.c_void_p,ctypes.c_void_p]
    k.CloseHandle.argtypes=[ctypes.c_void_p]
    handle=k.CreateJobObjectW(None,None)
    if not handle: raise E.PrerequisiteBlocked('Owned process-tree job unavailable')
    limits=Limits(); limits.basic.flags=0x2000  # JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
    if not k.SetInformationJobObject(handle,9,ctypes.byref(limits),ctypes.sizeof(limits)):
        k.CloseHandle(handle); raise E.PrerequisiteBlocked('Owned process-tree limit setup failed')
    output=(run_dir/'SERVER_STDERR.txt').open('w',encoding='utf-8')
    child=None
    try:
        child=subprocess.Popen([sys.executable,'-B',str(E.ROOT/'testing_modules/pre_uat/performance_server.py'),str(config_path)],cwd=E.ROOT,
            stdout=output,stderr=output,stdin=subprocess.PIPE,text=True,creationflags=subprocess.CREATE_NO_WINDOW)
        if not k.AssignProcessToJobObject(handle,int(child._handle)):
            raise E.PrerequisiteBlocked('Owned subprocess job assignment failed')
        return {'child':child,'job':handle,'output':output,'run_dir':run_dir}
    except BaseException:
        if child and child.poll() is None: child.terminate(); child.wait(timeout=10)
        output.close(); k.CloseHandle(handle)
        raise

def control_proof(owned):
    child=owned['child']
    proof=json.loads((owned['run_dir']/'CHILD_CONTROL.json').read_text(encoding='utf-8'))
    if proof!={'nonce':E.ACTIVE['nonce'],'pid':child.pid,'redis_run_id':E.ACTIVE['redis_run_id']}:
        raise E.PrerequisiteBlocked('Owned child control identity mismatch')
    return proof

async def ready(client, owned, seconds=20):
    child=owned['child']; deadline=time.perf_counter()+seconds; attempts=[]
    try:
        while True:
            if child.poll() is not None:
                raise E.PrerequisiteBlocked('Owned API exited before readiness; exit '+str(child.returncode))
            remaining=deadline-time.perf_counter()
            if remaining<=0: raise E.PrerequisiteBlocked('Owned API startup deadline exceeded')
            try:
                import httpx
                response=await asyncio.wait_for(client.get('/__pre_uat/ownership',timeout=min(2,remaining)),timeout=remaining)
                attempts.append({'status':response.status_code,'monotonic':time.perf_counter()})
                response.raise_for_status()
                proof=response.json()
                expected={'nonce':E.ACTIVE['nonce'],'pid':child.pid,'redis_run_id':E.ACTIVE['redis_run_id'],'defaults':DEFAULTS,'mock_calls':0}
                if proof!=expected: raise E.PrerequisiteBlocked('HTTP ownership identity mismatch')
                control_proof(owned)
                E.ACTIVE['http_ownership_verified']=True
                return proof
            except (httpx.HTTPError,asyncio.TimeoutError) as exc:
                attempts.append({'error_type':type(exc).__name__,'monotonic':time.perf_counter()})
                await asyncio.sleep(min(.2,max(0,deadline-time.perf_counter())))
    finally:
        (owned['run_dir']/'READINESS_ATTEMPTS.json').write_text(json.dumps(attempts,indent=2),encoding='utf-8')

def finish(owned, require_graceful=True, injected_cleanup_error=False):
    child=owned['child']; report={'pid':child.pid,'cleanup_errors':[],'forced_termination':False}
    try:
        if child.poll() is None:
            try:
                control_proof(owned)
                child.stdin.write(json.dumps({'nonce':E.ACTIVE['nonce'],'command':'shutdown'})+'\n'); child.stdin.flush()
                report['owned_control_shutdown_sent']=True
            except Exception as exc:
                report['control_error']=sanitized(exc)
            try: child.wait(timeout=12)
            except subprocess.TimeoutExpired:
                report['forced_termination']=True
                # Close only this owned job: kills its members, never a PID/name search.
                ctypes.windll.kernel32.CloseHandle(owned['job']); owned['job']=None
                child.wait(timeout=10)
        report['exit_code']=child.returncode
        if child.poll() is None: raise E.PrerequisiteBlocked('Owned subprocess still running')
        report['process_exited']=True
        if require_graceful:
            proof=json.loads((owned['run_dir']/'SERVER_PROOF.json').read_text(encoding='utf-8'))
            if proof['nonce']!=E.ACTIVE['nonce'] or proof['network_violations'] or not proof['workers_stopped'] or child.returncode or report['forced_termination']:
                raise E.PrerequisiteBlocked('Graceful worker/isolation proof failed')
            report['graceful_workers_verified']=True
        if injected_cleanup_error:
            raise E.PrerequisiteBlocked('INTENTIONAL_CLEANUP_DIAGNOSTIC_FAILURE')
    except Exception as exc:
        report['cleanup_errors'].append(sanitized(exc))
    finally:
        if owned['job']:
            ctypes.windll.kernel32.CloseHandle(owned['job']); owned['job']=None
        if child.stdin: child.stdin.close()
        owned['output'].close()
        (owned['run_dir']/'PROCESS_CLEANUP.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    return report

async def startup_case(run_dir, config, intentional=False):
    import httpx
    run_dir.mkdir()
    config={**config,'run_dir':str(run_dir),'intentional_pre_readiness_failure':intentional}
    path=run_dir/'OWNED_SERVER_CONFIG.json'; path.write_text(json.dumps(config),encoding='utf-8')
    result={'intentional_failure':intentional,'startup_error':None}; owned=None
    try:
        owned=launch(path,run_dir)
        async with httpx.AsyncClient(base_url=f"http://127.0.0.1:{config['api_port']}",trust_env=False) as client:
            result['ownership']=await ready(client,owned)
    except Exception as exc: result['startup_error']=sanitized(exc)
    finally:
        if owned: result['cleanup']=finish(owned,require_graceful=not intentional,injected_cleanup_error=intentional)
    if intentional:
        stages=json.loads((run_dir/'STARTUP_STAGES.json').read_text(encoding='utf-8'))
        primary=next((s for s in stages if s.get('reason')=='INTENTIONAL_PRE_READINESS_FAILURE'),None)
        result['child_original_failure']=primary
        result['status']='PASS' if primary and result['startup_error'] and result['cleanup']['process_exited'] and any(e.get('reason')=='INTENTIONAL_CLEANUP_DIAGNOSTIC_FAILURE' for e in result['cleanup']['cleanup_errors']) else 'FAIL'
    else:
        result['status']='PASS' if result['startup_error'] is None and result['cleanup'].get('graceful_workers_verified') and not result['cleanup']['cleanup_errors'] else 'BLOCKED'
    (run_dir/'DIAGNOSTIC_RESULT.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
    return result

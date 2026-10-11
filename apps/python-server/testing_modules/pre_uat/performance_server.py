"""Private owned HTTP server. Only launched by run_phase2b2.py."""
import asyncio
from contextlib import asynccontextmanager
import hashlib
import json
from pathlib import Path
import sys
import time
import os
import threading
import traceback

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT)); sys.dont_write_bytecode = True
from testing_modules.pre_uat import integration_environment as E
from testing_modules.pre_uat.performance_environment import install_guards, DEFAULTS

STAGES=[]
RUN_DIR=None
def stage(name, exception=None):
    item={'stage':name,'monotonic':time.perf_counter(),'pid':os.getpid()}
    if 'temp_directory_was_uninitialized' in E.ACTIVE:
        item['temp_directory_was_uninitialized']=E.ACTIVE['temp_directory_was_uninitialized']
    if exception is not None:
        item['exception_type']=type(exception).__name__
        item['frames']=[{'file':Path(f.filename).name,'line':f.lineno,'function':f.name} for f in traceback.extract_tb(exception.__traceback__)]
        if isinstance(exception,E.PrerequisiteBlocked): item['reason']=str(exception)
    STAGES.append(item)
    if RUN_DIR:
        (RUN_DIR/'STARTUP_STAGES.json').write_text(json.dumps(STAGES,indent=2),encoding='utf-8')


def main():
    global RUN_DIR
    config = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
    run_dir = Path(config['run_dir'])
    if not run_dir.is_relative_to(ROOT/'testing_modules/pre_uat/evidence'):
        raise E.PrerequisiteBlocked('Invalid owned run directory')
    RUN_DIR=run_dir
    stage('configuration_loaded')
    E.ACTIVE.update(nonce=config['nonce'],api_port=config['api_port'],upload_folder=Path(config['upload_folder']),role='server',stage_callback=stage)
    install_guards(run_dir, config['redis_port'])
    stage('guards_installed')
    import redis
    client = redis.Redis(host='127.0.0.1',port=config['redis_port'],decode_responses=True,socket_timeout=2,socket_connect_timeout=1)
    if client.info('server')['run_id'] != config['redis_run_id']:
        raise E.PrerequisiteBlocked('Owned Redis identity mismatch')
    (run_dir/'CHILD_CONTROL.json').write_text(json.dumps({'nonce':config['nonce'],'pid':os.getpid(),'redis_run_id':config['redis_run_id']}),encoding='utf-8')
    stage('redis_identity_verified')
    if config.get('intentional_pre_readiness_failure'):
        raise E.PrerequisiteBlocked('INTENTIONAL_PRE_READINESS_FAILURE')
    stage('importing_fastapi')
    from fastapi import FastAPI
    stage('importing_routes')
    from app.api.routes.upload import router as uploads
    from app.api.routes.jobs import router as jobs
    from app.api.routes.analytics import router as analytics
    from app.workers import worker
    from app.analytics import cqi_recommender as cqi
    from testing_modules.pre_uat.support import valid_recommendation
    stage('application_imports_complete')
    mock_json = json.dumps(valid_recommendation('Review the measured synthetic CLO gaps.'))
    calls, transitions = [], []
    async def offline_provider(prompt):
        # No artificial delay; request-path overhead only.
        if 'Synthetic Person' in prompt or 'SYN-00' in prompt:
            raise E.PrerequisiteBlocked('Unanonymized synthetic identity in AI prompt')
        calls.append({'monotonic':time.perf_counter(),'prompt_sha256':hashlib.sha256(prompt.encode()).hexdigest()})
        return mock_json
    cqi.call_llm_api = offline_provider
    original_update = worker.update_job
    async def observed(job_id, updates):
        await original_update(job_id, updates)
        saved = client.get('obelisk:preuat_'+config['nonce']+':job:'+job_id)
        transitions.append({'job_id':job_id,'status':json.loads(saved)['status'],'monotonic':time.perf_counter()})
    worker.update_job = observed
    tasks = []
    @asynccontextmanager
    async def lifespan(app):
        stage('lifespan_startup')
        tasks.extend(asyncio.create_task(worker.start_worker(i)) for i in range(DEFAULTS['JOB_WORKER_COUNT']))
        try: yield
        finally:
            for task in tasks: task.cancel()
            await asyncio.gather(*tasks,return_exceptions=True)
            await asyncio.sleep(1.5)
            snapshot = {'nonce':config['nonce'],'defaults':DEFAULTS,'network_violations':E.ACTIVE['network_violations'],
                        'mock_calls':calls,'transitions':transitions,'workers_stopped':all(t.done() for t in tasks)}
            (run_dir/'SERVER_PROOF.json').write_text(json.dumps(snapshot,indent=2),encoding='utf-8')
            stage('workers_stopped')
    app = FastAPI(lifespan=lifespan)
    app.include_router(uploads); app.include_router(jobs,prefix='/jobs'); app.include_router(analytics,prefix='/analytics')
    import uvicorn
    server = uvicorn.Server(uvicorn.Config(app,host='127.0.0.1',port=config['api_port'],log_level='error',access_log=False))
    def control():
        for line in sys.stdin:
            try: message=json.loads(line)
            except ValueError: continue
            if message=={'nonce':config['nonce'],'command':'shutdown'}:
                server.should_exit=True
                return
    threading.Thread(target=control,daemon=True).start()
    @app.get('/__pre_uat/ownership')
    async def ownership():
        return {'nonce':config['nonce'],'pid':os.getpid(),'redis_run_id':client.info('server')['run_id'],'defaults':DEFAULTS,'mock_calls':len(calls)}
    @app.post('/__pre_uat/shutdown')
    async def shutdown(request: __import__('fastapi').Request):
        if (await request.json())!={'nonce':config['nonce']}:
            raise __import__('fastapi').HTTPException(status_code=403,detail='Owned control token required')
        server.should_exit = True
        return {'nonce':config['nonce'],'stopping':True}
    stage('entering_uvicorn')
    server.run()
    stage('uvicorn_returned')

if __name__ == '__main__':
    try: main()
    except BaseException as exc:
        stage('startup_exception',exc)
        raise SystemExit(2) from None

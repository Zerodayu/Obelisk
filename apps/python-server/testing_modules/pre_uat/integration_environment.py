"""Owned local Redis container only; never accept a Redis host/URL from users/env."""
import importlib.abc
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
from types import ModuleType, SimpleNamespace
from unittest.mock import Mock
from uuid import uuid4
from testing_modules.pre_uat.isolation import IsolationViolation

ROOT = Path(__file__).resolve().parents[2]
ACTIVE = {"verified":False,"network_violations":[],"cleanup":[],"phase":"2B-1"}
DOCKER_HOST = "npipe:////./pipe/dockerDesktopLinuxEngine"
IMAGE = "redis:7-alpine"


class PrerequisiteBlocked(IsolationViolation):
    pass


def docker(*args):
    env = {k:v for k,v in os.environ.items() if k not in {"DOCKER_HOST","DOCKER_CONTEXT","DOCKER_TLS_VERIFY","DOCKER_CERT_PATH"}}
    try:
        result = subprocess.run([ACTIVE["docker"],"--host",DOCKER_HOST,*args],capture_output=True,text=True,timeout=15,env=env)
    except (OSError,subprocess.TimeoutExpired):
        raise PrerequisiteBlocked("Local Docker command unavailable or timed out") from None
    if result.returncode:
        raise PrerequisiteBlocked("Local Docker command failed: "+args[0]+" (exit "+str(result.returncode)+"). Docker Desktop Linux engine must be running; image redis:7-alpine must already be cached.")
    return result.stdout.strip()


class Imports(importlib.abc.MetaPathFinder):
    def find_spec(self,fullname,path=None,target=None):
        if fullname in {"app.main","app.core.env"} or fullname.startswith(("app.database","app.models")):
            raise PrerequisiteBlocked("Stateful startup/credential/database import denied")


def install_guards(run_dir, port):
    pair_context = threading.local()
    native_pair = socket.socketpair

    def pair(*args,**kwargs):
        if args or kwargs: raise PrerequisiteBlocked("Only asyncio's default socketpair is allowed")
        pair_context.active = True
        try: return native_pair()
        finally: pair_context.active = False
    socket.socketpair = pair

    def audit(event,args):
        if event in {"socket.connect","socket.getaddrinfo","socket.bind","socket.sendto"}:
            if getattr(pair_context,"active",False): return
            address = args[1] if event != "socket.getaddrinfo" else args[:2]
            if event in {"socket.connect","socket.getaddrinfo"} and isinstance(address,tuple) and address[:2] == ("127.0.0.1",port): return
            ACTIVE["network_violations"].append(event)
            raise PrerequisiteBlocked("Service network access denied outside owned Redis")
        if event == "open" and isinstance(args[0],(str,bytes,os.PathLike)):
            path = Path(os.fsdecode(args[0])).resolve()
            if path.name.startswith(".env"):
                raise PrerequisiteBlocked("Credential-file access denied")
            if path.is_relative_to(ROOT/"classrecord_templates") or path.is_relative_to(ROOT/"uploads"):
                raise PrerequisiteBlocked("Existing workbook/upload access denied")
            mode,flags = args[1],args[2]
            writing = isinstance(mode,str) and any(c in mode for c in "wax+") or isinstance(flags,int) and flags & (os.O_WRONLY|os.O_RDWR|os.O_CREAT|os.O_TRUNC)
            allowed = path.is_relative_to(Path(tempfile.gettempdir()).resolve()) or path.is_relative_to(run_dir) or path in {ROOT/"testing_modules/pre_uat/PRE_UAT_RESULTS.md",ROOT/"testing_modules/pre_uat/PRE_UAT_RESULTS.csv"}
            if writing and not allowed: raise PrerequisiteBlocked("Write outside temporary/evidence paths denied")
    sys.addaudithook(audit)
    sys.meta_path.insert(0,Imports())
    for key in list(os.environ):
        if key.startswith(("OBELISK_","GOOGLE_","GEMINI_","REDIS_","DOTENV_")): del os.environ[key]
    config = ModuleType("app.core.config")
    config.settings = SimpleNamespace(REDIS_HOST="127.0.0.1",REDIS_PORT=port,ENV="preuat_"+ACTIVE["nonce"],JOB_QUEUE_MAXSIZE=10,JOB_WORKER_COUNT=2,MAX_CONCURRENT_UPLOAD_WRITES=3,UPLOAD_FOLDER=str(ACTIVE["upload_folder"]),UPLOAD_CHUNK_SIZE=65536,MAX_UPLOAD_SIZE=1048576,llm_api_keys_list=[],LLM_MODEL="offline-unused")
    sys.modules[config.__name__] = config
    log = ModuleType("app.core.logging")
    log.logger = Mock()
    sys.modules[log.__name__] = log
    ACTIVE["logger"] = log.logger


def prepare(run_dir):
    if any(n.startswith("app.") for n in sys.modules): raise PrerequisiteBlocked("Fresh process required")
    ACTIVE.update(docker=shutil.which("docker"),docker_host=DOCKER_HOST,image=IMAGE)
    if not ACTIVE["docker"]: raise PrerequisiteBlocked("Docker CLI unavailable; no native/shared Redis fallback exists")
    ACTIVE["docker_server_version"] = docker("info","--format","{{.ServerVersion}}")
    # No pull or service startup if the local engine/image prerequisite is absent.
    image_id = docker("image","inspect",IMAGE,"--format","{{.Id}}")
    nonce = uuid4().hex
    ACTIVE.update(nonce=nonce,container="obelisk-preuat-"+nonce,image_id=image_id)
    ACTIVE["scratch"] = tempfile.TemporaryDirectory(prefix="obelisk_preuat_integration_")
    ACTIVE["upload_folder"] = Path(ACTIVE["scratch"].name)/"uploads"
    ACTIVE["upload_folder"].mkdir()
    docker("run","--detach","--pull=never","--name",ACTIVE["container"],"--label","obelisk.preuat.run="+nonce,"--publish","127.0.0.1::6379","--read-only","--tmpfs","/data:rw,noexec,nosuid,size=16m","--user","redis","--entrypoint","redis-server",image_id,"--save","","--appendonly","no","--bind","0.0.0.0","--protected-mode","no")
    label = docker("inspect","--format",'{{index .Config.Labels "obelisk.preuat.run"}}',ACTIVE["container"])
    if label != nonce: raise PrerequisiteBlocked("Container ownership label mismatch")
    binding = json.loads(docker("inspect","--format",'{{json (index .NetworkSettings.Ports "6379/tcp")}}',ACTIVE["container"]))
    if len(binding)!=1 or binding[0]["HostIp"]!="127.0.0.1": raise PrerequisiteBlocked("Redis port must be published only on loopback")
    port = int(binding[0]["HostPort"])
    if port == 6379: raise PrerequisiteBlocked("Refusing conventional/shared Redis port")
    ACTIVE["redis_port"] = port
    install_guards(run_dir,port)
    import redis
    client = redis.Redis(host="127.0.0.1",port=port,db=0,decode_responses=True,socket_connect_timeout=1,socket_timeout=2)
    deadline = time.monotonic()+8
    while True:
        try: client.ping(); break
        except redis.exceptions.ConnectionError:
            if time.monotonic()>=deadline: raise PrerequisiteBlocked("Owned Redis did not become ready")
            time.sleep(0.1)
    if client.dbsize()!=0: raise PrerequisiteBlocked("Owned disposable Redis is not empty")
    if client.config_get("appendonly")["appendonly"]!="no" or client.config_get("save")["save"]!="": raise PrerequisiteBlocked("Redis persistence must be disabled")
    ACTIVE.update(client=client,redis_run_id=client.info("server")["run_id"],redis_version=client.info("server")["redis_version"],verified=True)
    # Existing synthetic fixtures require a verified isolated context, not their
    # Phase 2A socket guard. This integration context permits only owned Redis.
    from testing_modules.pre_uat.isolation import STATE
    STATE.update(verified=True,phase="2B-1 owned Redis integration")
    from google import genai
    genai.Client = Mock(side_effect=PrerequisiteBlocked("Live AI client denied"))
    ACTIVE["queue_prefix"] = "obelisk:preuat_"+nonce+":"


def cleanup():
    client = ACTIVE.get("client")
    if client:
        if client.info("server")["run_id"] != ACTIVE["redis_run_id"]: raise PrerequisiteBlocked("Redis identity changed; cleanup refused")
        keys = list(client.scan_iter(match=ACTIVE["queue_prefix"]+"*"))
        if keys: client.delete(*keys)
        ACTIVE["cleanup"].append("Only owned namespace keys deleted; no FLUSHDB/FLUSHALL")
        client.close()
    if ACTIVE.get("container"):
        label = docker("inspect","--format",'{{index .Config.Labels "obelisk.preuat.run"}}',ACTIVE["container"])
        if label != ACTIVE["nonce"]: raise PrerequisiteBlocked("Container cleanup refused: ownership mismatch")
        docker("rm","--force",ACTIVE["container"])
        ACTIVE["cleanup"].append("Owned disposable container removed")
    if ACTIVE.get("scratch"):
        ACTIVE["scratch"].cleanup()
        ACTIVE["cleanup"].append("Temporary upload folder removed")


def proof():
    return {k:v for k,v in ACTIVE.items() if k not in {"client","logger","scratch","upload_folder"}}

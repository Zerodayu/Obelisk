"""Owned-endpoint guards and dependency-free Windows resource observations."""
import ast
import ctypes
import os
from pathlib import Path
import shutil
import socket
import sys
import threading
import tempfile
from types import ModuleType, SimpleNamespace
from unittest.mock import Mock

from testing_modules.pre_uat import integration_environment as E

DEFAULTS = {}
tree = ast.parse((E.ROOT / 'app/core/config.py').read_text(encoding='utf-8'))
for node in tree.body:
    if isinstance(node, ast.ClassDef) and node.name == 'Settings':
        for item in node.body:
            if isinstance(item, ast.AnnAssign) and item.target.id in {
                'JOB_WORKER_COUNT','JOB_QUEUE_MAXSIZE','MAX_CONCURRENT_UPLOAD_WRITES',
                'UPLOAD_CHUNK_SIZE','MAX_UPLOAD_SIZE'}:
                DEFAULTS[item.target.id] = eval(compile(ast.Expression(item.value), '<source-default>', 'eval'), {'__builtins__': {}})
if DEFAULTS != dict(JOB_WORKER_COUNT=4, JOB_QUEUE_MAXSIZE=200,
                    MAX_CONCURRENT_UPLOAD_WRITES=5, UPLOAD_CHUNK_SIZE=1048576,
                    MAX_UPLOAD_SIZE=10485760):
    raise E.PrerequisiteBlocked('Source-default configuration changed; review workloads first')


def install_guards(run_dir, redis_port):
    """Must precede every app import in both runner and separate server."""
    if any(n.startswith('app.') for n in sys.modules):
        raise E.PrerequisiteBlocked('Application imported before performance isolation')
    # tempfile discovery opens a probe under _once_lock. Never trigger it from
    # inside an open audit event: nested gettempdir would deadlock that lock.
    E.ACTIVE['temp_directory_was_uninitialized']=tempfile.tempdir is None
    temp_root=Path(tempfile.gettempdir()).resolve()
    if E.ACTIVE.get('stage_callback'):
        E.ACTIVE['stage_callback']('temp_directory_cached_before_audit')
    allowed = {('127.0.0.1', redis_port), ('127.0.0.1', E.ACTIVE['api_port'])}
    context = threading.local()
    original_pair = socket.socketpair
    def pair(*args, **kwargs):
        if args or kwargs: raise E.PrerequisiteBlocked('Nondefault socketpair denied')
        context.active = True
        try: return original_pair()
        finally: context.active = False
    socket.socketpair = pair
    def audit(event, args):
        if E.ACTIVE.get('role') == 'server' and event in {'subprocess.Popen','os.system','os.posix_spawn','os.spawn'}:
            raise E.PrerequisiteBlocked('API subprocess may not create descendants')
        if event in {'socket.connect','socket.getaddrinfo','socket.bind','socket.sendto'}:
            if getattr(context, 'active', False): return
            address = args[:2] if event == 'socket.getaddrinfo' else args[1]
            if isinstance(address, tuple) and address[:2] in allowed:
                if event != 'socket.bind' or address[:2] == ('127.0.0.1', E.ACTIVE['api_port']): return
            E.ACTIVE['network_violations'].append(event)
            raise E.PrerequisiteBlocked('Network access outside owned endpoints denied')
        if event == 'open' and isinstance(args[0], (str, bytes, os.PathLike)):
            path = Path(os.fsdecode(args[0])).resolve()
            if path.name.startswith('.env') or path.is_relative_to(E.ROOT/'uploads') or path.is_relative_to(E.ROOT/'classrecord_templates'):
                raise E.PrerequisiteBlocked('Credential/existing-data access denied')
            mode, flags = args[1:3]
            writing = isinstance(mode,str) and any(c in mode for c in 'wax+') or isinstance(flags,int) and flags & (os.O_WRONLY|os.O_RDWR|os.O_CREAT|os.O_TRUNC)
            allowed_write = path.is_relative_to(temp_root) or path.is_relative_to(E.ROOT/'testing_modules/pre_uat')
            if writing and not allowed_write:
                raise E.PrerequisiteBlocked('Write outside owned evidence/temp paths denied')
    sys.addaudithook(audit)
    sys.meta_path.insert(0, E.Imports())
    for key in list(os.environ):
        if key.startswith(('OBELISK_','GOOGLE_','GEMINI_','REDIS_','DOTENV_')): del os.environ[key]
    config = ModuleType('app.core.config')
    config.settings = SimpleNamespace(**DEFAULTS, REDIS_HOST='127.0.0.1', REDIS_PORT=redis_port,
        ENV='preuat_'+E.ACTIVE['nonce'], UPLOAD_FOLDER=str(E.ACTIVE['upload_folder']),
        llm_api_keys_list=[], LLM_MODEL='offline-unused')
    sys.modules[config.__name__] = config
    logger = ModuleType('app.core.logging')
    logger.logger = Mock()
    sys.modules[logger.__name__] = logger
    E.ACTIVE['logger'] = logger.logger
    from testing_modules.pre_uat.isolation import STATE
    STATE.update(verified=True, phase='2B-2 owned HTTP/Redis')
    if E.ACTIVE.get('stage_callback'): E.ACTIVE['stage_callback']('importing_offline_provider_sdk')
    from google import genai
    genai.Client = Mock(side_effect=E.PrerequisiteBlocked('Live Gemini denied'))


class Memory(ctypes.Structure):
    _fields_ = [('length', ctypes.c_ulong), ('load', ctypes.c_ulong)] + [(n,ctypes.c_ulonglong) for n in ('total','free','total_page','free_page','total_virtual','free_virtual','extended')]

class ProcessMemory(ctypes.Structure):
    _fields_ = [('size',ctypes.c_ulong),('faults',ctypes.c_ulong)] + [(n,ctypes.c_size_t) for n in ('peak_working','working','peak_paged','paged','peak_nonpaged','nonpaged','pagefile','peak_pagefile')]

def resources(pids):
    if sys.platform != 'win32': raise E.PrerequisiteBlocked('Resource guard currently requires Windows')
    memory = Memory(); memory.length = ctypes.sizeof(memory)
    if not ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(memory)):
        raise E.PrerequisiteBlocked('Host memory observation failed')
    k = ctypes.windll.kernel32
    k.OpenProcess.restype = ctypes.c_void_p
    k.CloseHandle.argtypes = [ctypes.c_void_p]
    k.GetProcessTimes.argtypes = [ctypes.c_void_p] + [ctypes.c_void_p]*4
    ctypes.windll.psapi.GetProcessMemoryInfo.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_ulong]
    processes = {}
    for pid in pids:
        handle = k.OpenProcess(0x0400|0x0010, False, pid)
        if not handle: raise E.PrerequisiteBlocked('Owned process resource observation failed')
        try:
            pm = ProcessMemory(); pm.size = ctypes.sizeof(pm)
            times = [ctypes.c_ulonglong() for _ in range(4)]
            if not ctypes.windll.psapi.GetProcessMemoryInfo(handle,ctypes.byref(pm),pm.size) or not k.GetProcessTimes(handle,*[ctypes.byref(t) for t in times]):
                raise E.PrerequisiteBlocked('Owned process metrics unavailable')
            processes[str(pid)] = {'working_set_bytes':pm.working,'peak_working_set_bytes':pm.peak_working,'cpu_seconds':(times[2].value+times[3].value)/10000000}
        finally: k.CloseHandle(handle)
    return {'host_total_ram_bytes':memory.total,'host_free_ram_bytes':memory.free,
            'disk_free_bytes':shutil.disk_usage(E.ROOT).free,'logical_cpus':os.cpu_count(),'processes':processes}

def enforce_resources(snapshot):
    # Safety guards, never performance acceptance criteria.
    if snapshot['host_free_ram_bytes'] < 1024**3 or snapshot['disk_free_bytes'] < 1024**3:
        raise E.PrerequisiteBlocked('Safety stop: less than 1 GiB free RAM or disk')
    if any(p['working_set_bytes'] > 1024**3 for p in snapshot['processes'].values()):
        raise E.PrerequisiteBlocked('Safety stop: owned Python process exceeds 1 GiB working set')

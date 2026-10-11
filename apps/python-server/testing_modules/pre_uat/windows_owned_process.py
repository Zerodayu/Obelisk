"""Windows-only suspended launch and retained handles. No API calls at import.

CreateProcessW receives an explicit job list AND CREATE_SUSPENDED. Atomic job
assignment avoids even an orphaned suspended launcher if the parent crashes
between process creation and a separate AssignProcessToJobObject call.
No fallback to uncontained creation and no termination by PID/name.
"""
import ctypes
from ctypes import wintypes as W
import json
import os
from pathlib import Path
import subprocess
import sys
import time


class OwnershipError(RuntimeError):
    pass


class BasicLimits(ctypes.Structure):
    _fields_ = [('process_time', ctypes.c_int64), ('job_time', ctypes.c_int64),
                ('flags', W.DWORD), ('minimum', ctypes.c_size_t),
                ('maximum', ctypes.c_size_t), ('active_limit', W.DWORD),
                ('affinity', ctypes.c_size_t), ('priority', W.DWORD),
                ('scheduling', W.DWORD)]


class ExtendedLimits(ctypes.Structure):
    _fields_ = [('basic', BasicLimits), ('io', ctypes.c_uint64 * 6)] + [
        (name, ctypes.c_size_t) for name in
        ('process_memory', 'job_memory', 'peak_process', 'peak_job')]


class Accounting(ctypes.Structure):
    _fields_ = [(name, ctypes.c_int64) for name in
                ('user', 'kernel', 'period_user', 'period_kernel')] + [
        (name, W.DWORD) for name in ('faults', 'total', 'active', 'terminated')]


class StartupInfo(ctypes.Structure):
    _fields_ = [('cb', W.DWORD), ('reserved', W.LPWSTR), ('desktop', W.LPWSTR),
                ('title', W.LPWSTR)] + [(name, W.DWORD) for name in
                ('x', 'y', 'xsize', 'ysize', 'xchars', 'ychars', 'fill', 'flags')] + [
                ('show', W.WORD), ('reserved_size', W.WORD),
                ('reserved_bytes', ctypes.c_void_p), ('stdin', W.HANDLE),
                ('stdout', W.HANDLE), ('stderr', W.HANDLE)]


class StartupInfoEx(ctypes.Structure):
    _fields_ = [('startup', StartupInfo), ('attributes', ctypes.c_void_p)]


class ProcessInfo(ctypes.Structure):
    _fields_ = [('process', W.HANDLE), ('thread', W.HANDLE),
                ('pid', W.DWORD), ('tid', W.DWORD)]


def kernel():
    if sys.platform != 'win32':
        raise OwnershipError('Owned process containment requires Windows')
    k = ctypes.WinDLL('kernel32', use_last_error=True)
    signatures = {
        'CreateJobObjectW': ([ctypes.c_void_p, W.LPCWSTR], W.HANDLE),
        'SetInformationJobObject': ([W.HANDLE, ctypes.c_int, ctypes.c_void_p, W.DWORD], W.BOOL),
        'AssignProcessToJobObject': ([W.HANDLE, W.HANDLE], W.BOOL),
        'IsProcessInJob': ([W.HANDLE, W.HANDLE, ctypes.POINTER(W.BOOL)], W.BOOL),
        'ResumeThread': ([W.HANDLE], W.DWORD),
        'TerminateProcess': ([W.HANDLE, W.UINT], W.BOOL),
        'TerminateJobObject': ([W.HANDLE, W.UINT], W.BOOL),
        'OpenProcess': ([W.DWORD, W.BOOL, W.DWORD], W.HANDLE),
        'GetProcessId': ([W.HANDLE], W.DWORD),
        'GetCurrentProcess': ([], W.HANDLE),
        'GetProcessTimes': ([W.HANDLE] + [ctypes.c_void_p] * 4, W.BOOL),
        'WaitForSingleObject': ([W.HANDLE, W.DWORD], W.DWORD),
        'GetExitCodeProcess': ([W.HANDLE, ctypes.POINTER(W.DWORD)], W.BOOL),
        'QueryInformationJobObject': ([W.HANDLE, ctypes.c_int, ctypes.c_void_p,
                                       W.DWORD, ctypes.c_void_p], W.BOOL),
        'CloseHandle': ([W.HANDLE], W.BOOL),
        'InitializeProcThreadAttributeList': ([ctypes.c_void_p, W.DWORD, W.DWORD,
                                              ctypes.POINTER(ctypes.c_size_t)], W.BOOL),
        'UpdateProcThreadAttribute': ([ctypes.c_void_p, W.DWORD, ctypes.c_size_t,
                                      ctypes.c_void_p, ctypes.c_size_t,
                                      ctypes.c_void_p, ctypes.c_void_p], W.BOOL),
        'DeleteProcThreadAttributeList': ([ctypes.c_void_p], None),
        'CreateProcessW': ([W.LPCWSTR, W.LPWSTR, ctypes.c_void_p, ctypes.c_void_p,
                            W.BOOL, W.DWORD, ctypes.c_void_p, W.LPCWSTR,
                            ctypes.POINTER(StartupInfoEx), ctypes.POINTER(ProcessInfo)], W.BOOL),
    }
    for name, (args, result) in signatures.items():
        fn = getattr(k, name)
        fn.argtypes, fn.restype = args, result
    return k


def checked(value, operation):
    if not value:
        raise OwnershipError(operation + ' failed; winerror=' + str(ctypes.get_last_error()))
    return value


def process_identity(handle):
    k = kernel()
    times = [ctypes.c_uint64() for _ in range(4)]
    checked(k.GetProcessTimes(handle, *[ctypes.byref(t) for t in times]), 'GetProcessTimes')
    pid = checked(k.GetProcessId(handle), 'GetProcessId')
    return {'pid': pid, 'process_created_100ns': times[0].value}


def current_identity():
    return process_identity(kernel().GetCurrentProcess())


class OwnedProcess:
    """Noninheritable owner job plus launcher/server handles held until exit proof."""
    def __init__(self):
        self.k = kernel()
        self.job = self.launcher = self.thread = self.server = None
        self.pid = None
        self.stdin = self.output = None
        self.assigned = False
        self.proof = {'suspended_creation': True, 'resumed': False}

    def member(self, handle):
        if not self.job or not handle:
            raise OwnershipError('Missing retained job/process handle')
        answer = W.BOOL()
        checked(self.k.IsProcessInJob(handle, self.job, ctypes.byref(answer)), 'IsProcessInJob')
        if not answer.value:
            raise OwnershipError('Process is not in the newly owned job')

    def active_count(self):
        info = Accounting()
        checked(self.k.QueryInformationJobObject(self.job, 1, ctypes.byref(info),
                                                 ctypes.sizeof(info), None), 'Job accounting')
        return info.active

    def poll(self):
        wait = self.k.WaitForSingleObject(self.launcher, 0)
        if wait == 258:  # WAIT_TIMEOUT; STILL_ACTIVE alone is not reliable exit proof
            return None
        if wait != 0:
            raise OwnershipError('Launcher wait failed')
        code = W.DWORD()
        checked(self.k.GetExitCodeProcess(self.launcher, ctypes.byref(code)), 'Launcher exit code')
        return code.value

    def verify_server(self, identity):
        pid = identity.get('pid')
        if type(pid) is not int or not 0 < pid <= 0xffffffff:
            raise OwnershipError('Invalid serving-process identity')
        if self.server:
            handle = self.server
        else:
            handle = checked(self.k.OpenProcess(0x0400 | 0x0010 | 0x100000, False, pid),
                             'Open serving process for query/read/synchronize only')
        try:
            self.member(handle)
            if self.k.WaitForSingleObject(handle, 0) != 258:
                raise OwnershipError('Serving process is not running')
            if process_identity(handle) != identity:
                raise OwnershipError('Serving-process creation identity mismatch')
            if not self.server:
                self.server = handle
            self.proof['server'] = {**identity, 'owned_job_member': True}
        except BaseException:
            if handle != self.server:
                self.k.CloseHandle(handle)
            raise
        return handle

    def send_shutdown(self, nonce):
        self.member(self.server)
        # One tiny message fits in an empty private pipe; never send arbitrary data.
        self.stdin.write(json.dumps({'nonce': nonce, 'command': 'shutdown'}) + '\n')
        self.stdin.flush()

    def wait_empty(self, seconds):
        deadline = time.monotonic() + seconds
        while True:
            count = self.active_count()
            handles = [h for h in (self.launcher, self.server) if h]
            waits = [self.k.WaitForSingleObject(h, 0) for h in handles]
            if any(w not in (0, 258) for w in waits):
                raise OwnershipError('Retained process exit wait failed')
            if count == 0 and all(w == 0 for w in waits):
                return {'job_active_processes': 0, 'retained_processes_exited': True}
            if time.monotonic() >= deadline:
                raise TimeoutError('Owned process job did not become empty')
            time.sleep(.05)

    def terminate_owned(self):
        if self.assigned:
            checked(self.k.TerminateJobObject(self.job, 2), 'Terminate only newly owned job')
        elif self.launcher:
            # Creation returned this exact handle and thread has NEVER been resumed.
            if self.proof['resumed']:
                raise OwnershipError('Refusing termination of an uncontained running process')
            checked(self.k.TerminateProcess(self.launcher, 2), 'Terminate newly created suspended launcher')

    def close(self):
        # Kill-on-close remains a final fail-safe for this job alone.
        for name in ('job', 'thread', 'server', 'launcher'):
            handle = getattr(self, name)
            if handle:
                checked(self.k.CloseHandle(handle), 'Close owned ' + name + ' handle')
                setattr(self, name, None)
        if self.stdin:
            self.stdin.close()
        if self.output:
            self.output.close()


def spawn(argv, cwd, run_dir, env):
    """Atomically contained CreateProcessW -> verify suspended member -> resume."""
    import msvcrt
    owned = OwnedProcess()
    read_fd = write_fd = None
    attributes = None
    try:
        owned.job = checked(owned.k.CreateJobObjectW(None, None), 'Create new unnamed job')
        limits = ExtendedLimits()
        limits.basic.flags = 0x2000  # KILL_ON_JOB_CLOSE; no breakaway permissions
        checked(owned.k.SetInformationJobObject(owned.job, 9, ctypes.byref(limits),
                                                ctypes.sizeof(limits)), 'Kill-on-close job limits')
        owned.output = (Path(run_dir) / 'SERVER_STDERR.txt').open('x', encoding='utf-8')
        read_fd, write_fd = os.pipe()
        owned.stdin = os.fdopen(write_fd, 'w', encoding='utf-8', buffering=1)
        write_fd = None
        stdin_handle = msvcrt.get_osfhandle(read_fd)
        output_handle = msvcrt.get_osfhandle(owned.output.fileno())
        size = ctypes.c_size_t()
        owned.k.InitializeProcThreadAttributeList(None, 2, 0, ctypes.byref(size))
        if not size.value:
            raise OwnershipError('Process attribute size unavailable')
        buffer = ctypes.create_string_buffer(size.value)
        checked(owned.k.InitializeProcThreadAttributeList(buffer, 2, 0, ctypes.byref(size)),
                'Initialize process attributes')
        attributes = buffer
        handles = (W.HANDLE * 2)(stdin_handle, output_handle)
        jobs = (W.HANDLE * 1)(owned.job)
        checked(owned.k.UpdateProcThreadAttribute(buffer, 0, 0x00020002, handles,
                ctypes.sizeof(handles), None, None), 'Explicit inherited handle list')
        # Windows 10+ assigns this noninheritable job atomically at creation.
        # Unsupported APIs/nested-job combinations fail CLOSED, with no fallback.
        checked(owned.k.UpdateProcThreadAttribute(buffer, 0, 0x0002000d, jobs,
                ctypes.sizeof(jobs), None, None), 'Atomic creation job list')
        startup = StartupInfoEx()
        startup.startup.cb = ctypes.sizeof(startup)
        startup.startup.flags = 0x00000100  # STARTF_USESTDHANDLES
        startup.startup.stdin = stdin_handle
        startup.startup.stdout = startup.startup.stderr = output_handle
        startup.attributes = ctypes.cast(buffer, ctypes.c_void_p)
        info = ProcessInfo()
        command = ctypes.create_unicode_buffer(subprocess.list2cmdline(argv))
        environment = ctypes.create_unicode_buffer('\0'.join(
            key+'='+value for key, value in sorted(env.items(), key=lambda item:item[0].upper()))+'\0\0')
        # No job/control/process handle can be inherited. Only listed pipe/log handles.
        for handle in (stdin_handle, output_handle):
            os.set_handle_inheritable(handle, True)
        try:
            checked(owned.k.CreateProcessW(str(argv[0]), command, None, None, True,
                0x00000004 | 0x00080000 | 0x00000400 | subprocess.CREATE_NO_WINDOW,
                environment, str(cwd), ctypes.byref(startup), ctypes.byref(info)),
                'Create suspended process with atomic owned job assignment')
        finally:
            # Copy handles even if interrupted immediately after the native call.
            owned.launcher, owned.thread, owned.pid = info.process, info.thread, info.pid
            owned.assigned = bool(info.process)
            for handle in (stdin_handle, output_handle):
                os.set_handle_inheritable(handle, False)
        os.close(read_fd)
        read_fd = None
        owned.proof['launcher'] = process_identity(owned.launcher)
        owned.proof['initial_thread_id'] = info.tid
        owned.proof['job_assigned_atomically_at_creation'] = True
        owned.member(owned.launcher)
        owned.proof['launcher']['owned_job_member_before_resume'] = True
        # All Python descendants, including the venv redirector's interpreter,
        # inherit this non-breakaway job before they can execute.
        previous = owned.k.ResumeThread(owned.thread)
        if previous != 1:
            raise OwnershipError('Unexpected initial thread suspension count: ' + str(previous))
        owned.proof['resumed'] = True
        (Path(run_dir) / 'PROCESS_CONTAINMENT.json').write_text(
            json.dumps(owned.proof, indent=2), encoding='utf-8')
        return owned
    except BaseException:
        cleanup = {'launch_failed': True, 'resumed': owned.proof['resumed']}
        try:
            if owned.launcher:
                owned.terminate_owned()
                # Also wait on the original handle if assignment failed (empty job).
                if owned.k.WaitForSingleObject(owned.launcher, 10000) != 0:
                    raise OwnershipError('Suspended launcher abort exit not verified')
                cleanup.update(owned.wait_empty(10))
        except BaseException as exc:
            cleanup['cleanup_error_type'] = type(exc).__name__
            raise OwnershipError('Launch aborted; owned process cleanup NOT VERIFIED') from exc
        finally:
            owned.close()
            (Path(run_dir) / 'LAUNCH_FAILURE_CLEANUP.json').write_text(
                json.dumps(cleanup, indent=2), encoding='utf-8')
        raise
    finally:
        if attributes is not None:
            owned.k.DeleteProcThreadAttributeList(attributes)
        for fd in (read_fd, write_fd):
            if fd is not None:
                os.close(fd)

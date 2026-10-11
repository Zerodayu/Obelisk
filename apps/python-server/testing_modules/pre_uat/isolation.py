"""Offline process bootstrap. Install before importing any application modules."""
import importlib.abc
import os
from pathlib import Path
import socket
import sys
import tempfile
import threading
from types import ModuleType, SimpleNamespace
from unittest.mock import Mock

ROOT = Path(__file__).resolve().parents[2]
STATE = {"verified": False, "violations": [], "probes": []}


class IsolationViolation(RuntimeError):
    pass


def deny(reason):
    STATE["violations"].append(reason)
    raise IsolationViolation(reason)


class ForbiddenImports(importlib.abc.MetaPathFinder):
    def find_spec(self, fullname, path=None, target=None):
        if fullname in {"app.main", "app.core.env", "app.services.job_queue"} or fullname.startswith(("app.database", "app.models", "app.workers")):
            deny("Forbidden stateful application import: " + fullname)
        return None


def bootstrap():
    if any(name.startswith("app.") for name in sys.modules):
        raise IsolationViolation("Bootstrap requires a fresh Python process")
    sys.dont_write_bytecode = True
    sys.path.insert(0, str(ROOT))
    # Only this subprocess is affected. Do not decrypt environment files.
    for key in list(os.environ):
        if key.startswith(("OBELISK_", "GOOGLE_", "GEMINI_", "REDIS_", "DOTENV_")):
            del os.environ[key]
    settings = SimpleNamespace(llm_api_keys_list=[], LLM_MODEL="offline-test-model")
    config = ModuleType("app.core.config")
    config.settings = settings
    config.__pre_uat_isolated__ = True
    sys.modules[config.__name__] = config
    logging = ModuleType("app.core.logging")
    logging.logger = Mock()  # Capture and discard; never write application/provider logs.
    sys.modules[logging.__name__] = logging
    sys.meta_path.insert(0, ForbiddenImports())

    evidence = (ROOT / "testing_modules/pre_uat/evidence").resolve()
    scratch = Path(tempfile.gettempdir()).resolve()
    pair_context = threading.local()
    native_socketpair = socket.socketpair
    STATE["asyncio_internal_socketpairs"] = 0

    def internal_socketpair(*args, **kwargs):
        # Windows implements the stdlib socketpair via a temporary loopback
        # listener/client. Allow ONLY the trusted zero-argument stdlib call,
        # in this thread, while it constructs asyncio's internal wakeup pipe.
        # No application-selected endpoint or service socket is allowed.
        if args or kwargs:
            deny("Non-default socketpair construction denied")
        pair_context.active = True
        try:
            pair = native_socketpair()
            STATE["asyncio_internal_socketpairs"] += 1
            return pair
        finally:
            pair_context.active = False
    socket.socketpair = internal_socketpair

    def audit(event, args):
        if event in {"socket.connect", "socket.getaddrinfo", "socket.sendto", "socket.bind"}:
            internal = getattr(pair_context,"active",False) and event != "socket.sendto"
            address = args[0] if event == "socket.getaddrinfo" else args[1][0]
            if not (internal and address in {"127.0.0.1","::1"}):
                deny("Network operation denied: " + event)
        if event == "open" and isinstance(args[0], (str, bytes, os.PathLike)):
            path = Path(os.fsdecode(args[0])).resolve()
            if path.name.startswith(".env") or path.name.lower() in {"credentials.json", "application_default_credentials.json"}:
                deny("Credential/environment file access denied")
            if path.is_relative_to(ROOT / "uploads") or path.is_relative_to(ROOT / "classrecord_templates") or path.is_relative_to(ROOT / "testing_modules/uploads"):
                deny("Non-synthetic workbook access denied")
            mode, flags = args[1], args[2]
            writing = (isinstance(mode, str) and any(c in mode for c in "wax+")) or (isinstance(flags, int) and bool(flags & (os.O_WRONLY | os.O_RDWR)))
            report = path.parent == evidence.parent and path.name in {"PRE_UAT_RESULTS.md", "PRE_UAT_RESULTS.csv"}
            if writing and not (path.is_relative_to(evidence) or path.is_relative_to(scratch) or report):
                deny("Write outside evidence/temporary directories denied")
    sys.addaudithook(audit)

    # Verify both guards before any test or application import. These probes
    # raise before DNS/network or file I/O, even if credentials exist locally.
    for label, operation in [
        ("network", lambda: socket.getaddrinfo("127.0.0.1", 1)),
        ("environment-file", lambda: (ROOT / ".env").open()),
        ("queue-import", lambda: __import__("app.services.job_queue")),
    ]:
        try:
            operation()
        except IsolationViolation:
            STATE["probes"].append(label + ": blocked as expected")
        else:
            raise IsolationViolation("Isolation probe unexpectedly succeeded: " + label)
    STATE["violations"].clear()  # Expected probes are recorded separately.
    from google import genai
    genai.Client = Mock(side_effect=lambda *a, **kw: deny("Unmocked Gemini client construction denied"))
    STATE.update(verified=True, environment_loader="not imported", redis="imports/service network blocked", gemini="Client denied unless explicitly mocked", synthetic_only=True, network_exception="Zero-argument stdlib socketpair only: Windows asyncio internal wakeup pipe; no service endpoint")
    return settings

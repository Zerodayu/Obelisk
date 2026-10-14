"""Fixture locations and isolation for the legacy offline runner."""
from contextlib import ExitStack, contextmanager
import os
from pathlib import Path
import sys
import tempfile
from unittest.mock import AsyncMock, patch

PROJECT_ROOT = Path(__file__).resolve().parents[2]
TEMPLATES_DIR = PROJECT_ROOT / "classrecord_templates"
BASE_WORKBOOK = TEMPLATES_DIR / "Old" / "JMCFI_Class_Record_Template_AUN-OBE-base.xlsx"
OLD_WORKBOOK = TEMPLATES_DIR / "Old" / "E-classrecord(LECTURE ONLY).xlsx"


def require_fixture(path: Path) -> Path:
    if not path.is_file():
        raise FileNotFoundError(f"Required legacy fixture is missing: {path}")
    return path


@contextmanager
def offline_context():
    """Use real compute code, temporary fixtures, and no external services.

    Only Windows asyncio's internal socketpair is allowed. All filesystem
    mutations must stay in a disposable directory. Environment patches are
    process-local and restored on exit. Use this before importing the server.
    """
    previous_bytecode = sys.dont_write_bytecode
    sys.dont_write_bytecode = True
    active = [False]
    try:
        with tempfile.TemporaryDirectory(prefix="obelisk-legacy-") as scratch:
            scratch_path = Path(scratch).resolve()

            def check_write(path):
                if isinstance(path, (str, bytes, os.PathLike)):
                    if not Path(os.fsdecode(path)).resolve().is_relative_to(scratch_path):
                        raise RuntimeError(f"Offline tests blocked persistent write: {path}")

            def guard(event, args):
                if not active[0]:
                    return
                if event == "socket.connect":
                    caller = sys._getframe(1)
                    if (caller.f_code.co_name == "_fallback_socketpair"
                            and Path(caller.f_code.co_filename).name == "socket.py"):
                        return
                    raise RuntimeError("Offline tests blocked network connection")
                if event == "socket.getaddrinfo":
                    raise RuntimeError("Offline tests blocked DNS lookup")
                if event == "open":
                    path, mode, flags = args
                    writing = (isinstance(mode, str) and any(c in mode for c in "wax+"))
                    writing |= isinstance(flags, int) and bool(
                        flags & (os.O_WRONLY | os.O_RDWR | os.O_CREAT | os.O_TRUNC)
                    )
                    if writing:
                        check_write(path)
                elif event in {"os.mkdir", "os.remove", "os.rmdir", "os.chmod", "os.utime"}:
                    check_write(args[0])
                elif event in {"os.rename", "os.link", "os.symlink"}:
                    check_write(args[0])
                    check_write(args[1])
                elif event in {"subprocess.Popen", "os.system"}:
                    raise RuntimeError("Offline tests blocked subprocess execution")

            sys.addaudithook(guard)
            active[0] = True
            try:
                with ExitStack() as stack:
                    stack.enter_context(patch.dict(os.environ, {}, clear=True))
                    stack.enter_context(patch.object(tempfile, "tempdir", scratch))
                    import app.core.env as env
                    stack.enter_context(patch.object(env, "load_env", return_value=None))
                    import redis
                    stack.enter_context(patch.object(
                        redis.Redis, "ping",
                        side_effect=redis.exceptions.ConnectionError("Offline tests: Redis disabled"),
                    ))
                    import app.main as main
                    stack.enter_context(patch.object(main, "start_worker", new=AsyncMock()))
                    import app.analytics.cqi_recommender as cqi
                    stack.enter_context(patch.object(cqi, "IS_DEBUG_MODE", True))
                    stack.enter_context(patch.object(
                        cqi.genai, "Client",
                        side_effect=AssertionError("Offline tests: real Gemini client disabled"),
                    ))
                    yield
            finally:
                active[0] = False
    finally:
        sys.dont_write_bytecode = previous_bytecode

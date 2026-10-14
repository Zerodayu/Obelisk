"""Opt-in local Compose connectivity check. The only Redis command is PING."""
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import time


REPOSITORY_ROOT = Path(__file__).resolve().parents[4]
COMPOSE_FILE = REPOSITORY_ROOT / "docker-compose.yml"
CONTAINER_NAME = "obelisk-redis"
HOST = "127.0.0.1"
PORT = 6379
SOCKET_TIMEOUT = 1.0
DOCKER_TIMEOUT = 3.0


class RedisCheckBlocked(RuntimeError):
    """Local container ownership could not be established before connecting."""


def _docker(*args: str) -> str:
    executable = shutil.which("docker")
    if not executable:
        raise RedisCheckBlocked("Docker CLI is unavailable; no Redis connection attempted")
    try:
        result = subprocess.run(
            [executable, *args], cwd=REPOSITORY_ROOT, capture_output=True,
            text=True, timeout=DOCKER_TIMEOUT, check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise RedisCheckBlocked("Docker inspection unavailable or timed out") from exc
    if result.returncode:
        raise RedisCheckBlocked("Docker inspection failed; check the local engine/container")
    return result.stdout.strip()


def _verify_local_container() -> None:
    # Do not load application settings or root env files, which can select prod.
    # Docker context metadata must prove a local engine before container inspection.
    if os.environ.get("DOCKER_HOST"):
        raise RedisCheckBlocked("DOCKER_HOST override is unsupported; use a verified local Docker context")
    if not COMPOSE_FILE.is_file():
        raise RedisCheckBlocked("This checkout's docker-compose.yml is missing")
    context = _docker("context", "show")
    endpoint = json.loads(_docker(
        "context", "inspect", context, "--format", "{{json .Endpoints.docker.Host}}",
    ))
    if not isinstance(endpoint, str) or not (
        endpoint.startswith("npipe:////./pipe/") or endpoint.startswith("unix:///")
    ):
        raise RedisCheckBlocked("Remote or unverified Docker endpoint refused")
    metadata = json.loads(_docker(
        "--context", context, "inspect", "--type", "container", CONTAINER_NAME,
        "--format", '{"running":{{json .State.Running}},'
        '"ports":{{json .NetworkSettings.Ports}},"labels":{{json .Config.Labels}}}',
    ))
    labels = metadata.get("labels") or {}
    working_dir = labels.get("com.docker.compose.project.working_dir", "")
    configs = labels.get("com.docker.compose.project.config_files", "").split(",")
    if (labels.get("com.docker.compose.service") != "redis"
            or not working_dir or Path(working_dir).resolve() != REPOSITORY_ROOT
            or COMPOSE_FILE.resolve() not in {Path(p).resolve() for p in configs if p}):
        raise RedisCheckBlocked("Container is not the Redis Compose service for this checkout")
    if metadata.get("running") is not True:
        raise RedisCheckBlocked("This checkout's Redis container is not running")
    bindings = (metadata.get("ports") or {}).get("6379/tcp") or []
    if not bindings or any(
        binding.get("HostIp") != HOST or binding.get("HostPort") != str(PORT)
        for binding in bindings
    ):
        raise RedisCheckBlocked("Expected exclusive 127.0.0.1:6379 publication was not verified")


def check_local_redis() -> int:
    """Return 0 PASS, 1 FAIL, or 2 BLOCKED, separately from offline results."""
    try:
        _verify_local_container()
    except (RedisCheckBlocked, ValueError, TypeError, AttributeError, OSError) as exc:
        message = str(exc) if isinstance(exc, RedisCheckBlocked) else "Invalid Docker ownership metadata"
        print(f"REDIS LIVE: BLOCKED: {message}; offline tests NOT RUN")
        return 2

    try:
        # Raw RESP avoids Redis-client handshake commands (CLIENT/SELECT/etc.).
        # Numeric loopback and AF_INET avoid DNS or environment-selected targets.
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as connection:
            connection.settimeout(SOCKET_TIMEOUT)
            connection.connect((HOST, PORT))
            connection.sendall(b"*1\r\n$4\r\nPING\r\n")
            response = b""
            deadline = time.monotonic() + SOCKET_TIMEOUT
            while b"\r\n" not in response and len(response) < 64:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise TimeoutError("Redis response deadline exceeded")
                connection.settimeout(remaining)
                chunk = connection.recv(64 - len(response))
                if not chunk:
                    break
                response += chunk
        if response != b"+PONG\r\n":
            print("REDIS LIVE: FAIL: Redis did not return PONG; offline tests NOT RUN")
            return 1
    except OSError as exc:
        print(f"REDIS LIVE: FAIL: {type(exc).__name__} at {HOST}:{PORT}; offline tests NOT RUN")
        return 1
    print(f"REDIS LIVE: PASS: PING/PONG at {HOST}:{PORT} ({CONTAINER_NAME}); offline tests NOT RUN")
    return 0

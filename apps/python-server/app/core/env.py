"""Root env-file loader — the single source of truth for OBELISK_* config.

NOTE: all env lives in the repo-root `.env.local` / `.env.prod` (dotenvx
encrypted, the same files the backend and frontend read). There is no
per-package env file anymore; `OBELISK_ENV` picks the profile
(`local` by default, `prod` inside the Docker etl service).
"""

from __future__ import annotations

import os
from pathlib import Path

import structlog
from dotenvx import load_dotenv

logger = structlog.get_logger()

VALID_PROFILES = ("local", "prod")

_DECRYPT_HINT = (
    "cannot decrypt the root env file — place the gitignored `.env.keys` at the "
    "repo root (ask a maintainer) or run `just env-decrypt`"
)


def _profile() -> str:
    raw = os.getenv("OBELISK_ENV", "local").strip().lower() or "local"
    # NOTE: a typo here would silently load the wrong file, so fail fast in every mode
    if raw not in VALID_PROFILES:
        raise RuntimeError(
            f"invalid OBELISK_ENV={raw!r}: expected one of {VALID_PROFILES}"
        )
    return raw


def _walk_up(start: Path, filename: str) -> Path | None:
    for directory in (start, *start.parents):
        candidate = directory / filename
        if candidate.is_file():
            return candidate
    return None


def resolve_env_file(profile: str | None = None) -> Path | None:
    """Locate the root env file for the active profile, or None when absent."""
    profile = profile or _profile()

    # NOTE: explicit path wins — covers the Docker layout, where apps/* is
    # flattened away and the file is bind-mounted at /app/.env.prod
    override = os.getenv("OBELISK_ENV_FILE")
    if override:
        return Path(override)

    filename = f".env.{profile}"
    # NOTE: walk up from this module first (repo layout), then from the cwd so
    # a runner started anywhere inside the checkout still finds the repo root
    found = _walk_up(Path(__file__).resolve().parent, filename) or _walk_up(
        Path.cwd(), filename
    )
    if found is None and profile == "prod":
        raise RuntimeError(
            f"OBELISK_ENV=prod but no {filename} was found above {Path.cwd()} — "
            "bind-mount the root env file (see docker-compose.yml etl service)"
        )
    if found is None:
        logger.warning(
            "env_file_missing",
            file=filename,
            hint="using built-in defaults; add OBELISK_* vars to the root env file",
        )
    return found


def load_env() -> Path | None:
    """Decrypt the root env file into os.environ and return its path.

    override=False keeps pre-set vars (compose `environment:`) authoritative.
    """
    profile = _profile()
    path = resolve_env_file(profile)
    if path is None:
        return None
    if not path.is_file():
        message = f"OBELISK_ENV={profile} but {path} does not exist"
        if profile == "prod":
            raise RuntimeError(message)
        logger.warning(
            "env_file_missing", file=str(path), hint="using built-in defaults"
        )
        return None

    try:
        load_dotenv(dotenv_path=path, override=False)
    except RuntimeError as exc:
        # NOTE: dotenvx raises [DECRYPTION_FAILED] when .env.keys is absent
        if profile == "prod":
            raise RuntimeError(f"{exc} — {_DECRYPT_HINT}") from exc
        logger.warning(
            "env_decrypt_failed",
            file=str(path),
            hint=f"{_DECRYPT_HINT}; continuing on built-in defaults",
        )
        return None

    logger.info("env_loaded", file=str(path), profile=profile)
    return path

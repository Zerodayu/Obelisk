import json
from typing import Annotated, Any, List

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

from app.core.env import load_env


class Settings(BaseSettings):
    """
    Application settings are managed by Pydantic's BaseSettings, which reads
    from environment variables only.

    NOTE: the root env file (`.env.local` / `.env.prod`, chosen by OBELISK_ENV)
    is decrypted into os.environ by app.core.env before Settings() is built —
    see that module; there is no per-package env file.
    """

    # --- Core Settings ---
    DEBUG: bool = False
    JOB_WORKER_COUNT: int = 4
    JOB_QUEUE_MAXSIZE: int = 200

    # NOTE: OBELISK_ENV profile (`local` for `just dev`, `prod` in compose) — namespaces the Redis job keys
    ENV: str = "local"

    # --- Redis Settings ---
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379

    # --- Upload Service Settings ---
    MAX_CONCURRENT_UPLOAD_WRITES: int = 5
    UPLOAD_FOLDER: str = "uploads"
    UPLOAD_CHUNK_SIZE: int = 1024 * 1024  # 1MB
    MAX_UPLOAD_SIZE: int = 10 * 1024 * 1024  # 10MB

    # --- CORS Settings ---
    # A comma-separated list of allowed origins or JSON list.
    # e.g., "http://localhost:3000,http://127.0.0.1:3000" or ["*"]
    ALLOWED_ORIGINS: Annotated[List[str], NoDecode] = ["*"]

    @field_validator("ALLOWED_ORIGINS", mode="before")
    @classmethod
    def split_origins(cls, v):
        if isinstance(v, str):
            v_trimmed = v.strip()
            if v_trimmed.startswith("[") and v_trimmed.endswith("]"):
                try:
                    parsed = json.loads(v_trimmed)
                    if isinstance(parsed, list):
                        return [str(o).strip() for o in parsed if str(o).strip()]
                except Exception:
                    pass
            return [o.strip() for o in v.split(",") if o.strip()]
        elif isinstance(v, list):
            return [str(o).strip() for o in v if str(o).strip()]
        return v

    # --- LLM Settings ---
    # Supports a single key (OBELISK_LLM_API_KEY) or multiple keys (OBELISK_LLM_API_KEYS).
    # Can be specified as a JSON array (e.g. ["key1", "key2"]) or comma-separated string.
    LLM_API_KEY: str | None = None
    LLM_API_KEYS: Annotated[List[str], NoDecode] = []
    LLM_MODEL: str = "gemini-3.6-flash"

    @field_validator("LLM_API_KEYS", mode="before")
    @classmethod
    def parse_api_keys(cls, v):
        if isinstance(v, str):
            v_trimmed = v.strip()
            if not v_trimmed:
                return []
            if v_trimmed.startswith("[") and v_trimmed.endswith("]"):
                try:
                    parsed = json.loads(v_trimmed)
                    if isinstance(parsed, list):
                        return [str(k).strip() for k in parsed if str(k).strip()]
                except Exception:
                    pass
            return [k.strip() for k in v.split(",") if k.strip()]
        elif isinstance(v, list):
            return [str(k).strip() for k in v if str(k).strip()]
        return v

    @property
    def llm_api_keys_list(self) -> List[str]:
        """
        Returns an ordered, deduplicated list of valid LLM API keys.
        Combines keys from LLM_API_KEYS and LLM_API_KEY (handling comma-separated strings or JSON lists).
        Filters out empty values and placeholder strings.
        """
        keys: List[str] = []

        def _add_candidates(val):
            if not val:
                return
            if isinstance(val, list):
                for item in val:
                    _add_candidates(item)
                return
            if isinstance(val, str):
                s = val.strip()
                if not s:
                    return
                if s.startswith("[") and s.endswith("]"):
                    try:
                        parsed = json.loads(s)
                        if isinstance(parsed, list):
                            for item in parsed:
                                _add_candidates(item)
                            return
                    except Exception:
                        pass
                for part in s.split(","):
                    cleaned = part.strip().strip("'\"")
                    if (
                        cleaned
                        and cleaned != "your_actual_api_key_here"
                        and cleaned not in keys
                    ):
                        keys.append(cleaned)

        _add_candidates(self.LLM_API_KEYS)
        _add_candidates(self.LLM_API_KEY)
        return keys

    def model_post_init(self, __context: Any) -> None:
        valid_keys = self.llm_api_keys_list
        if valid_keys:
            if not self.LLM_API_KEY or self.LLM_API_KEY == "your_actual_api_key_here":
                self.LLM_API_KEY = valid_keys[0]
            if not self.LLM_API_KEYS:
                self.LLM_API_KEYS = valid_keys

    # --- Optional Webapp Shared Secret ---
    # When set, incoming requests must present a matching X-Webapp-Secret header.
    WEBAPP_SHARED_SECRET: str | None = None

    model_config = SettingsConfigDict(
        env_prefix="OBELISK_",  # All env vars must start with OBELISK_
        case_sensitive=False,
    )


# NOTE: decrypt the root env file first — pydantic only reads process env
load_env()

# Create a single, global instance of the settings
settings = Settings()

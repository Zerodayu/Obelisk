from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List


class Settings(BaseSettings):
    """
    Application settings are managed by Pydantic's BaseSettings, which reads
    from environment variables and/or a .env file.
    """
    # --- Core Settings ---
    DEBUG: bool = False
    JOB_WORKER_COUNT: int = 2
    JOB_QUEUE_MAXSIZE: int = 100

    # --- Upload Service Settings ---
    MAX_CONCURRENT_UPLOAD_WRITES: int = 5
    UPLOAD_FOLDER: str = "uploads"
    UPLOAD_CHUNK_SIZE: int = 1024 * 1024  # 1MB
    MAX_UPLOAD_SIZE: int = 10 * 1024 * 1024  # 10MB

    # --- CORS Settings ---
    # A comma-separated list of allowed origins.
    # e.g., "http://localhost:3000,http://127.0.0.1:3000"
    ALLOWED_ORIGINS: List[str] = ["*"]

    # --- LLM API Key ---
    # The secret key for the LLM provider (e.g., Gemini, OpenAI).
    # This is loaded from the OBELISK_LLM_API_KEY environment variable.
    LLM_API_KEY: str | None = None

    model_config = SettingsConfigDict(
        env_prefix="OBELISK_",  # All env vars must start with OBELISK_
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )


# Create a single, global instance of the settings
settings = Settings()
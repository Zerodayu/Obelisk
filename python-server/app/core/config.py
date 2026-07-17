from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    DATABASE_URL: str = Field("sqlite+aiosqlite:///./obelisk.db")
    API_URL: str = Field("http://localhost:8000")
    UPLOAD_FOLDER: str = Field("./uploads")
    MAX_UPLOAD_SIZE: int = Field(10 * 1024 * 1024)
    UPLOAD_CHUNK_SIZE: int = Field(1024 * 1024)
    MAX_CONCURRENT_UPLOAD_WRITES: int = Field(8)
    JOB_QUEUE_MAXSIZE: int = Field(1000)
    JOB_WORKER_COUNT: int = Field(4)
    DEBUG: bool = Field(True)

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()


from pydantic import BaseSettings, Field

class Settings(BaseSettings):
    DATABASE_URL: str = Field("sqlite+aiosqlite:///./obelisk.db")
    API_URL: str = Field("http://localhost:8000")
    UPLOAD_FOLDER: str = Field("./uploads")
    MAX_UPLOAD_SIZE: int = Field(10 * 1024 * 1024)
    DEBUG: bool = Field(True)

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()


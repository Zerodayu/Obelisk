import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from app.core.config import settings

_engine = create_async_engine(settings.DATABASE_URL, echo=False, future=True)
AsyncSessionLocal = async_sessionmaker(_engine, expire_on_commit=False, class_=AsyncSession)


async def get_session() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session


# For simple tests and shell usage
async def test_connect():
    async with _engine.connect() as conn:
        await conn.run_sync(lambda conn: None)


__all__ = ["_engine", "AsyncSessionLocal", "get_session"]


from fastapi import APIRouter
from app.core.logging import logger

router = APIRouter()


@router.get("/")
async def health_check():
    logger.info("health_check")
    return {"status": "ok", "service": "obelisk-etl", "timestamp": "TODO: fill"}


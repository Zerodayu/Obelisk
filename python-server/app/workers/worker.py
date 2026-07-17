import asyncio
from app.core.logging import logger


async def start_worker(queue, worker_id: int):
    logger.info("worker_start", worker_id=worker_id, message="Background worker starting")
    try:
        while True:
            await queue.process_next()
    except asyncio.CancelledError:
        logger.info("worker_cancelled", worker_id=worker_id, message="Worker cancelled")


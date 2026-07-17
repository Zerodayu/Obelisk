import asyncio
from app.services.job_queue import job_queue
from app.core.logging import logger


async def start_worker(queue):
    logger.info("worker_start", message="Background worker starting")
    try:
        while True:
            await queue.process_next()
            # slight throttle to avoid busy loop
            await asyncio.sleep(0.01)
    except asyncio.CancelledError:
        logger.info("worker_cancelled", message="Worker cancelled")


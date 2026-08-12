import asyncio

import redis

from app.core.logging import logger
from app.services.job_queue import redis_client, JOB_QUEUE_KEY, update_job, get_job
from app.utils.types import JobStatus
from app.core.exceptions import OBELISKError
from app.etl.abstracts import run_full_pipeline
from app.etl.extract.extractor import ExcelExtractor
from app.etl.transform.transformer import SimpleTransformer
from app.etl.load.loader import DummyLoader

# Create stateless, reusable instances of the ETL components
# This is more efficient than creating them for every job.
EXTRACTOR = ExcelExtractor()
TRANSFORMER = SimpleTransformer()
LOADER = DummyLoader()

async def start_worker(worker_id: int):
    """The main function for a background worker."""
    logger.info("worker_start", worker_id=worker_id, message="Background worker starting")
    if not redis_client:
        logger.error("worker_exit_no_redis", worker_id=worker_id, message="Cannot start worker, Redis is not connected.")
        return

    try:
        while True:
            job_id = await get_job_from_queue(worker_id)
            if not job_id:
                # This will happen if brpop times out. It's normal.
                # The loop will continue, allowing the task to check for cancellation.
                continue

            job = await get_job(job_id)
            if not job:
                logger.warning("worker_job_not_found", worker_id=worker_id, job_id=job_id)
                continue

            try:
                await update_job(job_id, {"status": JobStatus.RUNNING.value})
                logger.info("job_running", job_id=job_id, worker_id=worker_id)

                # Run the full ETL pipeline
                result = await run_full_pipeline(EXTRACTOR, TRANSFORMER, LOADER, job.get("payload"))

                await update_job(job_id, {"status": JobStatus.COMPLETED.value, "result": result})
                logger.info("job_completed", job_id=job_id, worker_id=worker_id)

            except OBELISKError as exc:
                error_payload = exc.to_dict()
                logger.error("job_failed_structured", job_id=job_id, error_type=exc.__class__.__name__, details=error_payload)
                await update_job(job_id, {"status": JobStatus.FAILED.value, "error": error_payload})
            except Exception as exc:
                logger.error("job_failed_unexpected", job_id=job_id, error=str(exc), exc_info=True)
                error_payload = {
                    "error_type": "UnexpectedError",
                    "message": f"An unexpected error occurred: {str(exc)}",
                }
                await update_job(job_id, {"status": JobStatus.FAILED.value, "error": error_payload})

    except asyncio.CancelledError:
        logger.info("worker_cancelled", worker_id=worker_id, message="Worker shutting down.")
    except Exception as exc:
        logger.critical("worker_crashed", worker_id=worker_id, error=str(exc), exc_info=True)

async def get_job_from_queue(worker_id: int) -> str | None:
    """
    Performs a blocking pop on the Redis queue to wait for a job.
    A timeout is used to allow the worker to be cancelled gracefully.
    """
    try:
        # BRPOP is "Blocking Right Pop". It waits until an item is available.
        # We use a timeout of 1 second so the loop can be interrupted.
        # We run this in a thread to avoid blocking the main asyncio event loop.
        result = await asyncio.to_thread(redis_client.brpop, JOB_QUEUE_KEY, timeout=1)
        if result:
            job_id = result[1] # result is a tuple (queue_name, item)
            logger.debug("worker_job_popped", worker_id=worker_id, job_id=job_id)
            return job_id
    except redis.exceptions.RedisError as e:
        logger.error("worker_redis_error", worker_id=worker_id, error=str(e))
        # Wait before retrying to avoid spamming logs on connection loss
        await asyncio.sleep(5)
    return None

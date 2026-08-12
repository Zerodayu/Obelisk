import uuid
import orjson
import redis
from datetime import datetime
from typing import Dict, Any, List, Optional

from app.core.config import settings
from app.core.exceptions import QueueOverloadedError, JobNotFound
from app.core.logging import logger
from app.utils.types import JobStatus

# --- Redis Client Setup ---
# This single client instance will be reused across the application.
try:
    redis_client = redis.Redis(
        host=settings.REDIS_HOST,
        port=settings.REDIS_PORT,
        db=0,
        decode_responses=True  # Decode responses to UTF-8 automatically
    )
    redis_client.ping()
    logger.info("redis_connected", host=settings.REDIS_HOST, port=settings.REDIS_PORT)
except redis.exceptions.ConnectionError as e:
    logger.error("redis_connection_failed", error=str(e))
    redis_client = None

# --- Constants for Redis Keys ---
JOB_QUEUE_KEY = "obelisk:job_queue"
JOB_HASH_KEY_PREFIX = "obelisk:job:"

def _get_job_key(job_id: str) -> str:
    return f"{JOB_HASH_KEY_PREFIX}{job_id}"

async def enqueue(job_type: str = "etl", payload: Optional[Dict[str, Any]] = None) -> str:
    if not redis_client:
        raise ConnectionError("Redis client is not available.")

    # Check if the queue is full
    current_queue_size = redis_client.llen(JOB_QUEUE_KEY)
    if current_queue_size >= settings.JOB_QUEUE_MAXSIZE:
        raise QueueOverloadedError(queue_size=current_queue_size, max_size=settings.JOB_QUEUE_MAXSIZE)

    job_id = str(uuid.uuid4())
    now = datetime.utcnow()
    job = {
        "job_id": job_id,
        "type": job_type,
        "status": JobStatus.QUEUED.value,
        "payload": payload,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
        "error": None,
        "result": None,
    }

    # Store the job data as a JSON string in a Redis hash
    job_key = _get_job_key(job_id)
    redis_client.set(job_key, orjson.dumps(job))

    # Add the job_id to the queue (a Redis list)
    redis_client.lpush(JOB_QUEUE_KEY, job_id)

    logger.info("job_queued", job_id=job_id, queue_size=current_queue_size + 1)
    return job_id

async def get_job(job_id: str) -> Optional[Dict[str, Any]]:
    if not redis_client:
        raise ConnectionError("Redis client is not available.")

    job_key = _get_job_key(job_id)
    job_data = redis_client.get(job_key)

    if not job_data:
        return None
    
    return orjson.loads(job_data)

async def update_job(job_id: str, updates: Dict[str, Any]):
    """Helper to update specific fields of a job in Redis."""
    if not redis_client:
        raise ConnectionError("Redis client is not available.")

    job = await get_job(job_id)
    if not job:
        raise JobNotFound(job_id=job_id)

    job.update(updates)
    job["updated_at"] = datetime.utcnow().isoformat()
    
    job_key = _get_job_key(job_id)
    redis_client.set(job_key, orjson.dumps(job))

async def list_job_ids() -> List[str]:
    if not redis_client:
        raise ConnectionError("Redis client is not available.")
    
    # This can be slow on large numbers of jobs. Use with caution.
    keys = redis_client.keys(f"{JOB_HASH_KEY_PREFIX}*")
    return [key.split(':')[-1] for key in keys]

async def list_jobs() -> List[Dict[str, Any]]:
    if not redis_client:
        raise ConnectionError("Redis client is not available.")

    job_ids = await list_job_ids()
    if not job_ids:
        return []

    pipe = redis_client.pipeline()
    for job_id in job_ids:
        pipe.get(_get_job_key(job_id))
    
    job_data_list = pipe.execute()
    return [orjson.loads(job_data) for job_data in job_data_list if job_data]

async def queue_stats() -> Dict[str, int]:
    if not redis_client:
        raise ConnectionError("Redis client is not available.")
    
    return {
        "size": redis_client.llen(JOB_QUEUE_KEY),
        "maxsize": settings.JOB_QUEUE_MAXSIZE,
        "total_jobs_tracked": len(redis_client.keys(f"{JOB_HASH_KEY_PREFIX}*"))
    }

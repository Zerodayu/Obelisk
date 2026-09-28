from fastapi import APIRouter, HTTPException
from app.services import job_queue
from app.core.logging import logger

router = APIRouter()


@router.get("/")
async def list_all_jobs():
    """Lists all jobs currently tracked in Redis."""
    logger.info("api_list_jobs")
    jobs = await job_queue.list_jobs()
    return jobs


@router.get("/{job_id}")
async def get_job_by_id(job_id: str):
    """Gets the status and details of a specific job."""
    logger.info("api_get_job", job_id=job_id)
    job = await job_queue.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job

from fastapi import APIRouter, HTTPException
from app.services.job_queue import job_queue
from app.core.logging import logger

router = APIRouter()


@router.get("/")
async def list_jobs():
    logger.info("api_list_jobs")
    jobs = await job_queue.list_jobs()
    # Convert datetime objects to isoformat for JSON serialization
    serialized = []
    for j in jobs:
        job = j.copy()
        if job.get("created_at"):
            job["created_at"] = job["created_at"].isoformat()
        if job.get("updated_at"):
            job["updated_at"] = job["updated_at"].isoformat()
        serialized.append(job)
    return serialized


@router.get("/{job_id}")
async def get_job(job_id: str):
    logger.info("api_get_job", job_id=job_id)
    job = await job_queue.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    # Convert datetime objects for JSON serialization
    serialized_job = job.copy()
    if serialized_job.get("created_at"):
        serialized_job["created_at"] = serialized_job["created_at"].isoformat()
    if serialized_job.get("updated_at"):
        serialized_job["updated_at"] = serialized_job["updated_at"].isoformat()
        
    return serialized_job

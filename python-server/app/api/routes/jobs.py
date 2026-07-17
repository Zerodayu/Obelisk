from fastapi import APIRouter
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
    return {"jobs": serialized}


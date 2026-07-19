from fastapi import APIRouter, HTTPException, status
from app.services.job_queue import job_queue
from app.analytics.cqi_recommender import generate_cqi_recommendation
from app.schemas.class_record import ClassRecordHeader, StudentCLOAttainment
from app.core.logging import logger

router = APIRouter()


@router.get("/jobs/{job_id}/recommendation")
async def get_cqi_recommendation(job_id: str):
    logger.info("api_get_recommendation", job_id=job_id)
    
    job = await job_queue.get_job(job_id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    if job["status"] != "completed":
        error_message = f"Job is still in status: {job['status']}."
        if job["status"] == "failed":
            error_message = f"Job failed: {job.get('error', 'Unknown error')}"
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=error_message)

    try:
        # The job result is stored as serialized dicts, so we need to reconstruct the Pydantic models.
        loaded_result = job["result"]["loaded"]
        header = ClassRecordHeader(**loaded_result["header"])
        attainments = [StudentCLOAttainment(**record) for record in loaded_result["attainments"]]
    except (KeyError, TypeError) as e:
        logger.error("recommendation_data_error", job_id=job_id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not parse the required header and attainments from the completed job's result.",
        )

    try:
        recommendation = await generate_cqi_recommendation(header, attainments)
        return recommendation
    except NotImplementedError as e:
        logger.error("recommendation_not_implemented", job_id=job_id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail=str(e),
        )

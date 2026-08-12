from fastapi import APIRouter, HTTPException, status
from app.services import job_queue
from app.analytics.cqi_recommender import generate_cqi_recommendation
from app.analytics.institutional_summary import generate_institutional_summary, compute_summary_only
from app.schemas.class_record import ClassRecordHeader, StudentCLOAttainment
from app.schemas.institutional_summary import InstitutionalSummaryPayload
from app.core.logging import logger

# The prefix is now defined in app/main.py where the router is included.
router = APIRouter(tags=["analytics"])


@router.get("/jobs/{job_id}/recommendation", summary="Get Per-Course CQI Recommendation")
async def get_cqi_recommendation(job_id: str):
    """
    Generates a CQI recommendation for a single, completed ETL job.
    This provides a granular, course-level analysis of performance gaps.
    """
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


@router.post("/summary", summary="Get Institutional Rollup Numbers")
async def get_summary_only(payload: InstitutionalSummaryPayload):
    """
    Accepts a consolidated payload and returns pure data rollups (by department,
    program, etc.) without any AI/LLM-generated recommendation.
    """
    logger.info("api_get_summary_only", period=payload.period.label, submission_count=len(payload.submissions))
    try:
        summary = compute_summary_only(payload)
        return summary
    except Exception as e:
        logger.error("summary_only_error", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"An unexpected error occurred while generating the summary: {e}",
        )


@router.post("/institutional-summary", summary="Get Full Institution-Wide CQI Summary (VPAA Only)")
async def get_institutional_summary(payload: InstitutionalSummaryPayload):
    """
    Accepts a consolidated payload of multiple course results and generates
    a high-level, institution-wide CQI summary and an AI recommendation.
    """
    logger.info("api_get_institutional_summary", period=payload.period.label, submission_count=len(payload.submissions))
    try:
        summary = await generate_institutional_summary(payload)
        return summary
    except NotImplementedError as e:
        logger.error("institutional_summary_not_implemented", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail=str(e),
        )
    except Exception as e:
        logger.error("institutional_summary_error", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"An unexpected error occurred while generating the institutional summary: {e}",
        )

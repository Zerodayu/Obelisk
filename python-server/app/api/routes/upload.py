from fastapi import APIRouter, UploadFile, File, HTTPException, status
import os
from app.core.logging import logger
from app.core.exceptions import QueueOverloadedError
from app.services.upload_service import save_upload_file
from app.services.job_queue import job_queue

router = APIRouter()


@router.post("/upload", status_code=status.HTTP_202_ACCEPTED)
async def upload_file(file: UploadFile = File(...)) -> dict:
    logger.info("upload_received", filename=file.filename)
    # Save file (placeholder) and enqueue an ETL job
    try:
        path = await save_upload_file(file, destination_filename=file.filename)
    except ValueError as exc:
        logger.warning("upload_rejected", error=str(exc))
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail=str(exc))
    except Exception as exc:
        logger.error("upload_error", error=str(exc))
        raise HTTPException(status_code=500, detail="Unable to save uploaded file")

    try:
        job_id = await job_queue.enqueue(job_type="etl", payload={"file_path": path, "filename": file.filename})
    except QueueOverloadedError as exc:
        if os.path.exists(path):
            os.remove(path)
        logger.warning("queue_overloaded", error=str(exc))
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc))

    return {"job_id": job_id, "status": "queued"}


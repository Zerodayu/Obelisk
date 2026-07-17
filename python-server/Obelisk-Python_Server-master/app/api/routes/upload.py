from fastapi import APIRouter, UploadFile, File, HTTPException, status, Depends
from app.core.logging import logger
from app.services.upload_service import save_upload_file
from app.services.job_queue import job_queue
from app.schemas.job import JobCreate, JobRead

router = APIRouter()


@router.post("/upload", status_code=status.HTTP_202_ACCEPTED)
async def upload_file(file: UploadFile = File(...)) -> dict:
    logger.info("upload_received", filename=file.filename)
    # Save file (placeholder) and enqueue an ETL job
    try:
        path = await save_upload_file(file, destination_filename=file.filename)
    except Exception as exc:
        logger.error("upload_error", error=str(exc))
        raise HTTPException(status_code=500, detail="Unable to save uploaded file")

    job_id = await job_queue.enqueue(job_type="etl", payload={"file_path": path, "filename": file.filename})
    return {"job_id": job_id, "status": "queued"}


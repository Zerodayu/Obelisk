import asyncio
import uuid
from datetime import datetime
from typing import Dict, Any, List
from app.utils.types import JobStatus
from app.core.logging import logger
from app.core.config import settings
from app.core.exceptions import OBELISKError, QueueOverloadedError
from app.etl.abstracts import run_full_pipeline
from app.etl.extract.extractor import ExcelExtractor
from app.etl.transform.transformer import SimpleTransformer
from app.etl.load.loader import DummyLoader


class InMemoryJobQueue:
    def __init__(self):
        self._queue: asyncio.Queue[str] = asyncio.Queue(maxsize=settings.JOB_QUEUE_MAXSIZE)
        self._jobs: Dict[str, Dict[str, Any]] = {}

    async def enqueue(self, job_type: str = "etl", payload: Dict[str, Any] | None = None) -> str:
        job_id = str(uuid.uuid4())
        now = datetime.utcnow()
        job = {
            "job_id": job_id,
            "type": job_type,
            "status": JobStatus.QUEUED.value,
            "payload": payload,
            "created_at": now,
            "updated_at": now,
            "error": None,
            "result": None,
        }
        if self._queue.full():
            raise QueueOverloadedError(queue_size=self._queue.qsize(), max_size=self._queue.maxsize)

        self._jobs[job_id] = job
        try:
            self._queue.put_nowait(job_id)
        except asyncio.QueueFull:
            self._jobs.pop(job_id, None)
            raise QueueOverloadedError(queue_size=self._queue.qsize(), max_size=self._queue.maxsize)
        
        logger.info("job_queued", job_id=job_id)
        return job_id

    async def get_job(self, job_id: str) -> Dict[str, Any] | None:
        return self._jobs.get(job_id)

    async def list_job_ids(self) -> List[str]:
        return list(self._jobs.keys())

    async def list_jobs(self) -> List[Dict[str, Any]]:
        return list(self._jobs.values())

    async def _set_status(self, job_id: str, status: JobStatus):
        job = self._jobs.get(job_id)
        if job:
            job["status"] = status.value
            job["updated_at"] = datetime.utcnow()

    async def process_next(self):
        job_id = await self._queue.get()
        job = self._jobs.get(job_id)
        if not job:
            self._queue.task_done()
            return

        try:
            await self._set_status(job_id, JobStatus.RUNNING)
            logger.info("job_running", job_id=job_id)
            
            extractor = ExcelExtractor()
            transformer = SimpleTransformer()
            loader = DummyLoader()
            
            result = await run_full_pipeline(extractor, transformer, loader, job.get("payload"))
            job["result"] = result
            await self._set_status(job_id, JobStatus.COMPLETED)
            logger.info("job_completed", job_id=job_id)

        except OBELISKError as exc:
            logger.error("job_failed_structured", job_id=job_id, error_type=exc.__class__.__name__, details=exc.to_dict())
            job["error"] = exc.to_dict()
            await self._set_status(job_id, JobStatus.FAILED)
        except Exception as exc:
            logger.error("job_failed_unexpected", job_id=job_id, error=str(exc))
            job["error"] = {
                "error_type": "UnexpectedError",
                "message": f"An unexpected error occurred: {str(exc)}",
                "details": {},
            }
            await self._set_status(job_id, JobStatus.FAILED)
        finally:
            self._queue.task_done()

    async def queue_stats(self) -> Dict[str, int]:
        return {
            "size": self._queue.qsize(),
            "maxsize": self._queue.maxsize,
        }


# Single global instance
job_queue = InMemoryJobQueue()
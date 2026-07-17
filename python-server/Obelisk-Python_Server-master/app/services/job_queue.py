import asyncio
import uuid
from datetime import datetime
from typing import Dict, Any, List
from app.utils.types import JobStatus
from app.core.logging import logger
from app.etl.abstracts import run_full_pipeline
from app.etl.extract.extractor import ExcelExtractor
from app.etl.transform.transformer import SimpleTransformer
from app.etl.load.loader import DummyLoader


class InMemoryJobQueue:
    def __init__(self):
        self._queue: asyncio.Queue = asyncio.Queue()
        self._jobs: Dict[str, Dict[str, Any]] = {}

    async def enqueue(self, job_type: str = "etl", payload: Dict[str, Any] | None = None) -> str:
        job_id = str(uuid.uuid4())
        now = datetime.utcnow()
        job = {
            "id": job_id,
            "type": job_type,
            "status": JobStatus.QUEUED.value,
            "payload": payload,
            "created_at": now,
            "updated_at": now,
        }
        self._jobs[job_id] = job
        await self._queue.put(job_id)
        logger.info("job_queued", job_id=job_id)
        return job_id

    async def get_job(self, job_id: str) -> Dict[str, Any] | None:
        return self._jobs.get(job_id)

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
            return
        await self._set_status(job_id, JobStatus.RUNNING)
        logger.info("job_running", job_id=job_id)
        try:
            # Use placeholder ETL pipeline
            extractor = ExcelExtractor()
            transformer = SimpleTransformer()
            loader = DummyLoader()
            # source could be job.payload['file'] or reference; placeholder passes payload
            result = await run_full_pipeline(extractor, transformer, loader, job.get("payload"))
            job["result"] = result
            await self._set_status(job_id, JobStatus.COMPLETED)
            logger.info("job_completed", job_id=job_id)
        except Exception as exc:
            logger.error("job_failed", job_id=job_id, error=str(exc))
            job["error"] = str(exc)
            await self._set_status(job_id, JobStatus.FAILED)


# Single global instance (simple for skeleton)
job_queue = InMemoryJobQueue()


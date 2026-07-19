from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import asyncio
from app.core.config import settings
from app.core.logging import configure_logging, logger
from app.api.routes.upload import router as upload_router
from app.api.routes.etl import router as etl_router
from app.api.routes.jobs import router as jobs_router
from app.api.routes.health import router as health_router
from app.api.routes.analytics import router as analytics_router
from app.services.job_queue import job_queue
from app.workers.worker import start_worker

app = FastAPI(title="OBELISK ETL (placeholder)")

# Configure CORS using settings from config.py
# This is more secure and flexible than a hardcoded wildcard.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],  # Allows all standard methods
    allow_headers=["*"],  # Allows all headers
)

configure_logging()
logger.info("app_startup", message="Initializing OBELISK ETL application", debug=settings.DEBUG, allowed_origins=settings.ALLOWED_ORIGINS)

app.include_router(upload_router, prefix="", tags=["upload"])
app.include_router(etl_router, prefix="/etl", tags=["etl"])
app.include_router(jobs_router, prefix="/jobs", tags=["jobs"])
app.include_router(health_router, prefix="/health", tags=["health"])
app.include_router(analytics_router, prefix="", tags=["analytics"])

_worker_tasks: list[asyncio.Task] = []

@app.on_event("startup")
async def startup_event():
    global _worker_tasks
    worker_count = max(1, settings.JOB_WORKER_COUNT)
    logger.info("startup", message="Starting background workers", worker_count=worker_count)
    _worker_tasks = [
        asyncio.create_task(start_worker(job_queue, worker_id=index + 1))
        for index in range(worker_count)
    ]

@app.on_event("shutdown")
async def shutdown_event():
    global _worker_tasks
    for task in _worker_tasks:
        task.cancel()

    if _worker_tasks:
        await asyncio.gather(*_worker_tasks, return_exceptions=True)
        logger.info("shutdown", message="Worker tasks cancelled", worker_count=len(_worker_tasks))

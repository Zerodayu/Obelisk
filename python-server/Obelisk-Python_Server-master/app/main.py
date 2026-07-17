from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import asyncio
from app.core.config import settings
from app.core.logging import configure_logging, logger
from app.api.routes.upload import router as upload_router
from app.api.routes.etl import router as etl_router
from app.api.routes.jobs import router as jobs_router
from app.api.routes.health import router as health_router
from app.services.job_queue import job_queue
from app.workers.worker import start_worker

app = FastAPI(title="OBELISK ETL (placeholder)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

configure_logging()
logger.info("app_startup", message="Initializing OBELISK ETL application", debug=settings.DEBUG)

app.include_router(upload_router, prefix="", tags=["upload"])
app.include_router(etl_router, prefix="/etl", tags=["etl"])
app.include_router(jobs_router, prefix="/jobs", tags=["jobs"])
app.include_router(health_router, prefix="/health", tags=["health"])

_worker_task: asyncio.Task | None = None

@app.on_event("startup")
async def startup_event():
    global _worker_task
    # Start background worker to process queued ETL jobs
    logger.info("startup", message="Starting background worker")
    _worker_task = asyncio.create_task(start_worker(job_queue))

@app.on_event("shutdown")
async def shutdown_event():
    global _worker_task
    if _worker_task:
        _worker_task.cancel()
        try:
            await _worker_task
        except asyncio.CancelledError:
            logger.info("shutdown", message="Worker task cancelled")


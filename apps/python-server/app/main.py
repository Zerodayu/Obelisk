from fastapi import APIRouter, Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
import asyncio
from app.core.config import settings
from app.core.logging import configure_logging, logger
from app.core.security import verify_webapp_secret
from app.api.routes.upload import router as upload_router
from app.api.routes.etl import router as etl_router
from app.api.routes.jobs import router as jobs_router
from app.api.routes.health import router as health_router
from app.api.routes.analytics import router as analytics_router
from app.workers.worker import start_worker
from app.services.job_queue import redis_client

app = FastAPI(title="OBELISK ETL & Analytics Service")

# Configure CORS using settings from config.py
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

configure_logging()

protected_api_router = APIRouter(dependencies=[Depends(verify_webapp_secret)])
protected_api_router.include_router(upload_router, prefix="", tags=["upload"])
protected_api_router.include_router(jobs_router, prefix="/jobs", tags=["jobs"])
protected_api_router.include_router(analytics_router, prefix="/analytics", tags=["analytics"])

app.include_router(protected_api_router)
app.include_router(etl_router, prefix="/etl", tags=["etl"])
app.include_router(health_router, prefix="/health", tags=["health"])

_worker_tasks: list[asyncio.Task] = []


def _print_server_banner():
    """Prints a clear, descriptive server status summary at startup."""
    auth_status = "ENABLED (X-Webapp-Secret required)" if settings.WEBAPP_SHARED_SECRET else "DISABLED (Trusting internal network)"
    redis_status = f"CONNECTED ({settings.REDIS_HOST}:{settings.REDIS_PORT})" if redis_client else "DISCONNECTED (Background jobs disabled)"
    llm_status = "CONFIGURED (API key present)" if settings.LLM_API_KEY else "NO API KEY (Mock mode fallback)"
    
    print("\n" + "=" * 65)
    print("  OBELISK ETL & ANALYTICS SERVICE — SYSTEM STATUS")
    print("=" * 65)
    print(f"  • Environment:       {'DEBUG / LOCAL' if settings.DEBUG else 'PRODUCTION'}")
    print(f"  • Redis Queue:       {redis_status}")
    print(f"  • Shared Secret:     {auth_status}")
    print(f"  • LLM Engine:        {llm_status}")
    print(f"  • Background Workers: {settings.JOB_WORKER_COUNT} active worker coroutines")
    print(f"  • Upload Directory:  {settings.UPLOAD_FOLDER} (Max: {settings.MAX_UPLOAD_SIZE / (1024*1024):.0f}MB)")
    print(f"  • CORS Allowed:      {settings.ALLOWED_ORIGINS}")
    print("=" * 65)
    print("  Ready for requests on http://0.0.0.0:8000\n")


@app.on_event("startup")
async def startup_event():
    global _worker_tasks
    _print_server_banner()
    worker_count = max(1, settings.JOB_WORKER_COUNT)
    logger.info("startup", message="Starting background workers", worker_count=worker_count)
    _worker_tasks = [
        asyncio.create_task(start_worker(worker_id=index + 1))
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

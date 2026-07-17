from enum import Enum
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict


class JobStatus(Enum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


@dataclass
class JobRecord:
    id: str
    type: str
    status: JobStatus
    payload: Dict[str, Any] | None
    created_at: datetime
    updated_at: datetime


from pydantic import BaseModel, Field
from typing import Any
from datetime import datetime


class JobCreate(BaseModel):
    type: str = Field("etl")
    payload: dict | None = None


class JobRead(BaseModel):
    id: str
    type: str
    status: str
    payload: dict | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}


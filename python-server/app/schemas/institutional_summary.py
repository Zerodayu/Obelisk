from typing import List, Literal, Optional
from pydantic import BaseModel, ConfigDict

from app.schemas.class_record import ClassRecordHeader, StudentCLOAttainment


class Period(BaseModel):
    """Defines the time period for the summary."""
    type: Literal["semester", "year", "custom"]
    label: str


class CourseSubmission(BaseModel):
    """Represents the data for a single course section."""
    department: str
    program: str
    avp_group: Optional[str] = None
    course_code: str
    section: str
    header: ClassRecordHeader
    attainments: List[StudentCLOAttainment]


class InstitutionalSummaryPayload(BaseModel):
    """The consolidated input payload from the webapp."""
    model_config = ConfigDict(extra="forbid")

    period: Period
    submissions: List[CourseSubmission]

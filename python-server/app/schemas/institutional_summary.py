from typing import List, Literal, Optional, Dict, Any
from pydantic import BaseModel, ConfigDict

from app.schemas.class_record import ClassRecordHeader, StudentCLOAttainment


class Period(BaseModel):
    """Defines the time period for the summary."""
    type: Literal["semester", "year", "custom"]
    label: str


class CourseSubmission(BaseModel):
    """Represents the data for a single course section."""
    # These fields represent organizational data that will be looked up by the
    # webapp backend and included in the payload. They are optional for now
    # to allow for graceful degradation until that integration is complete.
    department: Optional[str] = None
    program: Optional[str] = None
    avp_group: Optional[str] = None
    
    course_code: Optional[str] = None
    section: Optional[str] = None
    header: ClassRecordHeader
    attainments: List[StudentCLOAttainment]
    clo_plo_mapping: List[Dict[str, Any]]


class InstitutionalSummaryPayload(BaseModel):
    """The consolidated input payload from the webapp."""
    model_config = ConfigDict(extra="forbid")

    period: Period
    submissions: List[CourseSubmission]

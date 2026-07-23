from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict


class ClassRecordHeader(BaseModel):
    model_config = ConfigDict(extra="forbid")

    course_code: str | None
    course_title: str | None
    course_type: str
    section: str | None
    semester_year: str
    instructor_name: str | None
    no_of_students: int
    threshold: float  # The course-specific threshold from the workbook
    grading_system: str | None
    # This field is no longer used in calculations but is kept for diagnostic purposes
    # to show what was in the original file.
    workbook_configured_weights_unused: Optional[dict[str, float]] = None


class RawScoreRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")

    student_id: str | None
    student_name: str
    grading_period: Literal["PRELIM", "MIDTERM", "FINAL"]
    assessment_category: Literal["TLA", "AT", "EXAM", "OUTPUT"]
    assessment_no: int
    clo_code: str
    activity_name: str | None
    max_score: float
    raw_score: float | None


class StudentCLOAttainment(BaseModel):
    model_config = ConfigDict(extra="forbid")

    student_id: str | None
    student_name: str
    clo_code: str
    
    # Informational breakdown fields; not used in the main calculation.
    tla_pct: float | None
    at_pct: float | None
    exam_pct: float | None
    output_pct: float | None
    
    # The primary output based on the institutional formula (Formula 1A).
    direct_clo_attainment_pct: float
    
    # Based on the fixed institutional threshold of 70%.
    met_threshold: bool
    
    # The new 4-tier descriptive level.
    clo_level: Literal["Exceptional", "Proficient", "Basic", "Below Basic"]
    
    formula_version: str

    # Data completeness fields (Section 3.6)
    is_record_complete: bool
    section_completeness_pct: float
    rule1_met: bool

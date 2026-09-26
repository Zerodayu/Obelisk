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
    workbook_configured_weights_unused: Optional[dict[str, float]] = None


class StudentRawCloData(BaseModel):
    """
    Extracted raw scores for a single student on a single CLO.
    Direct: Prelim/Midterm/Final Score and Max.
    Indirect: Course exit survey raw rating (1-5).
    """
    model_config = ConfigDict(extra="forbid")

    student_id: str | None
    student_name: str
    clo_code: str

    # Direct raw scores and maxes
    prelim_score: float | None = None
    prelim_max: float | None = None
    midterm_score: float | None = None
    midterm_max: float | None = None
    final_score: float | None = None
    final_max: float | None = None

    # Indirect raw rating (1-5)
    indirect_rating: float | None = None

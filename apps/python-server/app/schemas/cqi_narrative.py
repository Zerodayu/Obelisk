"""
Pydantic schemas for the CQI Report Narrative AI branch.
All models use extra="forbid". The schema rejects any payloads containing student names or IDs.
All numbers represent final display values computed by the webapp.
"""

from typing import List, Literal, Optional, Union
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.analytics.cqi_constants import (
    ALLOWED_ATTAINMENT_STATUSES,
    ALLOWED_LOOP_STATUSES,
    ALLOWED_RESPONSIBLE_ROLES,
    ROOT_CAUSE_CATEGORIES,
)

FORBIDDEN_STUDENT_KEYS = {
    "student_id",
    "student_name",
    "studentid",
    "studentname",
    "student_ids",
    "student_names",
    "students",
    "student",
}


class StrictBaseModel(BaseModel):
    """Base model forbidding all extra attributes and checking forbidden fields."""

    model_config = ConfigDict(extra="forbid")


class ProgramTermMetadata(StrictBaseModel):
    """Program and academic term metadata."""

    program_code: Optional[str] = Field(
        None, description="Short code of academic program, e.g., 'BSIT'."
    )
    program_name: Optional[str] = Field(
        None, description="Full title of academic program."
    )
    term_label: Optional[str] = Field(
        None, description="Academic term display label, e.g., 'SY 2025-2026, 1st Sem'."
    )
    academic_year: Optional[str] = Field(
        None, description="Academic year identifier, e.g., '2025-2026'."
    )


class EnrollmentAssessedCounts(StrictBaseModel):
    """Enrolled and assessed student population counts."""

    enrolled_count: Optional[int] = Field(
        None, ge=0, description="Total enrolled student count (unit: integer count)."
    )
    assessed_count: Optional[int] = Field(
        None, ge=0, description="Total assessed student count (unit: integer count)."
    )


class OutcomeAttainment(StrictBaseModel):
    """
    Per-outcome attainment record for CLO or PLO.
    All numeric fields are percentages (unit: percentage 0.0 - 100.0).
    Never mix fractions with percentages.
    """

    outcome_type: Literal["CLO", "PLO"] = Field(
        ..., description="Outcome level: 'CLO' or 'PLO'."
    )
    outcome_code: str = Field(
        ..., min_length=1, description="Outcome identifier, e.g., 'CLO1' or 'PLO3'."
    )
    target_pct: Optional[float] = Field(
        None, ge=0.0, le=100.0, description="Institutional target attainment percentage (unit: % 0-100)."
    )
    direct_pct: Optional[float] = Field(
        None, ge=0.0, description="Direct attainment percentage (unit: % 0-100+; extra credit can exceed 100)."
    )
    indirect_pct: Optional[float] = Field(
        None, ge=0.0, le=100.0, description="Indirect survey attainment percentage (unit: % 0-100)."
    )
    composite_pct: Optional[float] = Field(
        None, ge=0.0, description="Composite attainment percentage (unit: % 0-100+; 70 direct / 30 indirect)."
    )
    is_complete: Optional[bool] = Field(
        None, description="Completeness flag indicating all assessment evidence is present."
    )
    prior_cycle_composite_pct: Optional[float] = Field(
        None, ge=0.0, description="Prior cycle composite attainment percentage for longitudinal comparison (unit: % 0-100+)."
    )
    status: Optional[str] = Field(
        None, description="Webapp-computed attainment status, e.g., 'MET' or 'NOT MET'."
    )
    fact_id: Optional[str] = Field(
        None, description="Optional webapp-supplied fact identifier for this outcome."
    )

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v.strip().upper() not in ALLOWED_ATTAINMENT_STATUSES:
            raise ValueError(f"Status must be one of {ALLOWED_ATTAINMENT_STATUSES}, got: {v}")
        return v.strip().upper() if v else None


class CQIEntry(StrictBaseModel):
    """
    CQI action plan item computed by the webapp.
    Python only passes through these statuses as verified facts.
    """

    outcome_code: str = Field(
        ..., min_length=1, description="Associated outcome identifier, e.g., 'CLO1' or 'PLO2'."
    )
    status: str = Field(
        ..., description="Attainment status computed by the webapp ('MET' or 'NOT MET')."
    )
    loop_status: Optional[str] = Field(
        None,
        description="Loop closing status: 'CLOSED', 'OPEN_REASSESS', or 'OPEN_NOT_IMPLEMENTED'.",
    )
    is_escalated: Optional[bool] = Field(
        None, description="Whether this finding was escalated for higher administrative review."
    )
    intervention: Optional[str] = Field(
        None, description="Action or intervention planned (free-text; webapp must omit personal names)."
    )
    named_owner: Optional[str] = Field(
        None,
        description="Role or organizational title responsible for action (free-text; webapp must omit personal names).",
    )
    kpi: Optional[str] = Field(
        None, description="Key performance indicator or target metric for closing the loop."
    )
    root_cause_category: Optional[str] = Field(
        None,
        description="Canonical root-cause category (must match one of the 6 canonical categories).",
    )
    fact_id: Optional[str] = Field(
        None, description="Optional webapp-supplied fact identifier for this entry."
    )

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        cleaned = v.strip().upper()
        if cleaned not in ALLOWED_ATTAINMENT_STATUSES:
            raise ValueError(f"Status must be one of {ALLOWED_ATTAINMENT_STATUSES}, got: {v}")
        return cleaned

    @field_validator("loop_status")
    @classmethod
    def validate_loop_status(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            cleaned = v.strip().upper()
            if cleaned not in ALLOWED_LOOP_STATUSES:
                raise ValueError(f"loop_status must be one of {ALLOWED_LOOP_STATUSES}, got: {v}")
            return cleaned
        return None

    @field_validator("root_cause_category")
    @classmethod
    def validate_root_cause(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            cleaned = v.strip()
            if cleaned not in ROOT_CAUSE_CATEGORIES:
                raise ValueError(
                    f"root_cause_category must be one of {ROOT_CAUSE_CATEGORIES}, got: {v}"
                )
            return cleaned
        return None


class CQIReportNarrativePayload(StrictBaseModel):
    """
    Consolidated CQI payload sent by webapp for AI narrative generation.
    Every section is optional. The response states which sections are missing.
    No student names or student IDs are accepted; payloads containing them are rejected (422).
    """

    program_term: Optional[ProgramTermMetadata] = Field(
        None, description="Program and academic term metadata."
    )
    counts: Optional[EnrollmentAssessedCounts] = Field(
        None, description="Enrolled and assessed student population counts."
    )
    outcomes: Optional[List[OutcomeAttainment]] = Field(
        None, description="Outcome attainment measurements for CLO and/or PLO."
    )
    cqi_entries: Optional[List[CQIEntry]] = Field(
        None, description="CQI action plan entries with webapp-computed statuses."
    )

    @model_validator(mode="before")
    @classmethod
    def check_no_student_identifiers(cls, data: object) -> object:
        if isinstance(data, dict):
            for key in data:
                if key.lower().replace("-", "_") in FORBIDDEN_STUDENT_KEYS:
                    raise ValueError(f"Payload contains forbidden student identifier field: '{key}'.")
        return data


# --- Response Models ---


class FactItem(StrictBaseModel):
    """A flattened, verifiable fact provided to the LLM."""

    fact_id: str
    label: str
    value: Union[str, float, int, bool, None]
    unit: Optional[str] = None
    scope: str
    source_field: str


class RecommendationItem(StrictBaseModel):
    """A structured recommendation with required citations."""

    problem: str
    evidence_fact_ids: List[str]
    intervention: str
    responsible_role: str
    timeline: str
    success_indicator: str
    target: Optional[Union[str, float, int]] = None
    verification_method: str


class ContributingFactorItem(StrictBaseModel):
    """A possible contributing factor hypothesis with canonical root cause."""

    hypothesis: str
    root_cause_category: str
    evidence_fact_ids: List[str]


class PatternItem(StrictBaseModel):
    """Cross-outcome pattern description with citations."""

    description: str
    evidence_fact_ids: List[str]


class CQINarrativeOutput(StrictBaseModel):
    """Inner validated LLM output."""

    summary: str
    recommendations: List[RecommendationItem]
    possible_contributing_factors: List[ContributingFactorItem] = Field(default_factory=list)
    pattern: Optional[PatternItem] = None
    data_limitations: List[str] = Field(default_factory=list)


class CQINarrativeResponse(StrictBaseModel):
    """Top-level HTTP response envelope for the CQI narrative endpoint."""

    status: Literal["ok", "error", "narrative_unavailable"]
    summary: Optional[str] = None
    recommendations: List[RecommendationItem] = Field(default_factory=list)
    possible_contributing_factors: List[ContributingFactorItem] = Field(default_factory=list)
    pattern: Optional[PatternItem] = None
    data_limitations: List[str] = Field(default_factory=list)
    missing_sections: List[str] = Field(default_factory=list)
    facts_used: List[FactItem] = Field(default_factory=list)
    error: Optional[str] = None
    reason: Optional[str] = None
    prompt_used: Optional[str] = None

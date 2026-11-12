"""
Pydantic schemas for the CQI Report Narrative AI branch.
All models use extra="forbid". The schema rejects any payloads containing student names or IDs.
All numbers represent final display values computed by the webapp.
"""

from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional, Union
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


class OutputBaseModel(BaseModel):
    """Base model for LLM output schemas compatible with Gemini response_schema (omits additional_properties)."""

    model_config = ConfigDict(extra="ignore")


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
    course_code: Optional[str] = Field(
        None, description="Course identifier for course-level outcomes, e.g., 'IT 101'."
    )
    outcome_code: str = Field(
        ..., min_length=1, description="Outcome identifier, e.g., 'CLO1' or 'PLO3'."
    )
    priority: Optional[Literal["CRITICAL", "HIGH", "MEDIUM", "LOW"]] = Field(
        None, description="Webapp-computed priority level."
    )
    gap_pp: Optional[float] = Field(
        None,
        ge=0.0,
        description="Webapp-computed attainment gap in percentage points (target - composite).",
    )
    target_pct: Optional[float] = Field(
        None,
        ge=0.0,
        le=100.0,
        description="Institutional target attainment percentage (unit: % 0-100).",
    )
    direct_pct: Optional[float] = Field(
        None,
        ge=0.0,
        description="Direct attainment percentage (unit: % 0-100+; extra credit can exceed 100).",
    )
    indirect_pct: Optional[float] = Field(
        None,
        ge=0.0,
        le=100.0,
        description="Indirect survey attainment percentage (unit: % 0-100).",
    )
    composite_pct: Optional[float] = Field(
        None,
        ge=0.0,
        description="Composite attainment percentage (unit: % 0-100+; 70 direct / 30 indirect).",
    )
    is_complete: Optional[bool] = Field(
        None,
        description="Completeness flag indicating all assessment evidence is present.",
    )
    prior_cycle_composite_pct: Optional[float] = Field(
        None,
        ge=0.0,
        description="Prior cycle composite attainment percentage for longitudinal comparison (unit: % 0-100+).",
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
            raise ValueError(
                f"Status must be one of {ALLOWED_ATTAINMENT_STATUSES}, got: {v}"
            )
        return v.strip().upper() if v else None


class CQIEntry(StrictBaseModel):
    """
    CQI action plan item computed by the webapp.
    Python only passes through these statuses as verified facts.
    """

    course_code: Optional[str] = Field(
        None, description="Course identifier, e.g., 'IT 101'."
    )
    outcome_code: str = Field(
        ...,
        min_length=1,
        description="Associated outcome identifier, e.g., 'CLO1' or 'PLO2'.",
    )
    status: str = Field(
        ...,
        description="Attainment status computed by the webapp ('MET' or 'NOT MET').",
    )
    loop_status: Optional[str] = Field(
        None,
        description="Loop closing status: 'CLOSED', 'OPEN_REASSESS', or 'OPEN_NOT_IMPLEMENTED'.",
    )
    is_escalated: Optional[bool] = Field(
        None,
        description="Whether this finding was escalated for higher administrative review.",
    )
    intervention: Optional[str] = Field(
        None,
        description="Action or intervention planned (free-text; webapp must omit personal names).",
    )
    named_owner: Optional[str] = Field(
        None,
        description="Role or organizational title responsible for action (free-text; webapp must omit personal names).",
    )
    owner: Optional[str] = Field(
        None,
        description="Optional alias for named_owner role/title (webapp must omit personal names).",
    )
    timeline: Optional[str] = Field(
        None,
        description="Implementation timeline/schedule (e.g., 'Within 4 weeks', 'SY 2026-2027').",
    )
    deadline: Optional[str] = Field(
        None, description="Optional deadline date or term label."
    )
    kpi: Optional[str] = Field(
        None,
        description="Key performance indicator or target metric for closing the loop.",
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
            raise ValueError(
                f"Status must be one of {ALLOWED_ATTAINMENT_STATUSES}, got: {v}"
            )
        return cleaned

    @field_validator("loop_status")
    @classmethod
    def validate_loop_status(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            cleaned = v.strip().upper()
            if cleaned not in ALLOWED_LOOP_STATUSES:
                raise ValueError(
                    f"loop_status must be one of {ALLOWED_LOOP_STATUSES}, got: {v}"
                )
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

    @field_validator("outcomes")
    @classmethod
    def validate_unique_outcome_identifiers(
        cls, outcomes: Optional[List[OutcomeAttainment]]
    ) -> Optional[List[OutcomeAttainment]]:
        if not outcomes:
            return outcomes
        seen = set()
        for o in outcomes:
            ident = (
                f"{o.course_code}/{o.outcome_code}" if o.course_code else o.outcome_code
            )
            if ident in seen:
                raise ValueError(f"Duplicate outcome identifier found: '{ident}'.")
            seen.add(ident)
        return outcomes

    @model_validator(mode="before")
    @classmethod
    def check_no_student_identifiers(cls, data: object) -> object:
        if isinstance(data, dict):
            for key in data:
                if key.lower().replace("-", "_") in FORBIDDEN_STUDENT_KEYS:
                    raise ValueError(
                        f"Payload contains forbidden student identifier field: '{key}'."
                    )
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


ResponsibleRoleType = Literal["Faculty", "Program Chair", "Dean", "VPAA", "AQAU"]
RootCauseCategoryType = Literal[
    "1-Curriculum Design",
    "2-Instruction & Pedagogy",
    "3-Assessment Design",
    "4-Student Factors",
    "5-Resources & Tools",
    "6-Industry & Field Alignment",
]


class RecommendationItem(OutputBaseModel):
    """A structured recommendation with required citations, existing intervention assessment, and proposed additions."""

    problem: str
    evidence_fact_ids: List[str]
    existing_intervention_assessment: Optional[str] = Field(
        None,
        description="Assessment of the webapp-supplied intervention citing evidence_fact_ids, or 'None supplied'.",
    )
    proposed_additions: str = Field(
        ...,
        description="Concrete, actionable additions or modifications proposed by AI.",
    )
    intervention: Optional[str] = Field(
        None,
        description="Optional combined or legacy summary of the intervention.",
    )
    responsible_role: ResponsibleRoleType = Field(
        ...,
        description="Action owner role enum.",
    )
    timeline: Optional[str] = Field(
        None,
        description="Action timeframe, or null / 'To be set by Program Chair' if not supplied in facts.",
    )
    success_indicator: str
    target: Optional[float] = Field(
        None,
        description="Target attainment percentage benchmark (unit: float % 0.0 - 100.0, e.g., 75.0). Webapp appends % for display.",
    )
    verification_method: str

    @field_validator("target", mode="before")
    @classmethod
    def normalize_target_to_float(cls, v: Any) -> Optional[float]:
        if v is None:
            return None
        if isinstance(v, (int, float)):
            return float(v)
        if isinstance(v, str):
            cleaned = v.replace("%", "").strip()
            try:
                return float(cleaned)
            except ValueError:
                return None
        return None

    @model_validator(mode="before")
    @classmethod
    def populate_intervention_fields_before(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if not data.get("proposed_additions") and data.get("intervention"):
                data["proposed_additions"] = data["intervention"]
            elif not data.get("intervention") and data.get("proposed_additions"):
                data["intervention"] = data["proposed_additions"]
        return data

    @model_validator(mode="after")
    def validate_intervention_fields(self) -> RecommendationItem:
        if not self.proposed_additions and self.intervention:
            self.proposed_additions = self.intervention
        if not self.intervention and self.proposed_additions:
            self.intervention = self.proposed_additions
        if not self.proposed_additions and not self.intervention:
            raise ValueError(
                "Either proposed_additions or intervention must be provided."
            )
        return self


class ContributingFactorItem(OutputBaseModel):
    """A possible contributing factor hypothesis with canonical root cause."""

    hypothesis: str
    root_cause_category: RootCauseCategoryType = Field(
        ...,
        description="Canonical root cause category enum.",
    )
    evidence_fact_ids: List[str]


class PatternItem(OutputBaseModel):
    """Cross-outcome pattern description with citations."""

    description: str
    evidence_fact_ids: List[str]


class CQINarrativeOutput(OutputBaseModel):
    """Inner validated LLM output."""

    summary: str
    recommendations: List[RecommendationItem]
    possible_contributing_factors: List[ContributingFactorItem] = Field(
        default_factory=list
    )
    pattern: Optional[PatternItem] = None
    data_limitations: List[str] = Field(default_factory=list)


class AttemptProvenance(StrictBaseModel):
    """Execution provenance for a single LLM attempt."""

    attempt_number: int
    requested_model: str
    returned_model_version: Optional[str] = None
    response_id: Optional[str] = None
    usage_metadata: Optional[Dict[str, Any]] = None
    latency_ms: Optional[float] = None
    failure_reason: Optional[str] = None
    cost_usd: Optional[float] = None


class ProvenanceMetadata(StrictBaseModel):
    """Execution provenance metadata."""

    requested_model: str
    returned_model_version: Optional[str] = None
    response_id: Optional[str] = None
    usage_metadata: Optional[Dict[str, Any]] = None
    timestamp_utc: str
    is_debug_mode: bool
    execution_mode: Literal["live", "mock", "replay"]
    attempts_used: int = 1
    attempt_1_reason: Optional[str] = None
    facts_json: str
    prompt_sent: str
    attempts: List[AttemptProvenance] = Field(default_factory=list)
    total_latency_ms: Optional[float] = None
    total_cost_usd: Optional[float] = None

    @model_validator(mode="after")
    def check_live_mode_authenticity(self) -> ProvenanceMetadata:
        if self.execution_mode == "live" and self.is_debug_mode:
            raise ValueError(
                "Output cannot be labelled 'live' when is_debug_mode is True."
            )
        return self


class UncoveredOutcome(StrictBaseModel):
    """An outcome not addressed by the AI narrative, computed deterministically from facts."""

    scope: str = Field(..., description="Outcome scope, e.g. 'PLO1' or 'IT 101/CLO1'.")
    status: str = Field(..., description="Attainment status, e.g. 'NOT MET'.")
    composite: Optional[float] = Field(
        None, description="Composite attainment percentage."
    )
    target: Optional[float] = Field(None, description="Target attainment percentage.")
    fact_ids: List[str] = Field(
        default_factory=list, description="Fact IDs associated with this outcome."
    )


class CQINarrativeResponse(StrictBaseModel):
    """Top-level HTTP response envelope for the CQI narrative endpoint."""

    status: Literal["ok", "error", "narrative_unavailable"]
    summary: Optional[str] = None
    recommendations: List[RecommendationItem] = Field(default_factory=list)
    possible_contributing_factors: List[ContributingFactorItem] = Field(
        default_factory=list
    )
    pattern: Optional[PatternItem] = None
    data_limitations: List[str] = Field(default_factory=list)
    missing_sections: List[str] = Field(default_factory=list)
    facts_used: List[FactItem] = Field(default_factory=list)
    uncovered_outcomes: List[UncoveredOutcome] = Field(default_factory=list)
    provenance: Optional[ProvenanceMetadata] = None
    error: Optional[str] = None
    reason: Optional[str] = None
    prompt_used: Optional[str] = None

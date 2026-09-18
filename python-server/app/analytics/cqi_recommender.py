from collections import defaultdict
from typing import List
import google.generativeai as genai

from app.core.logging import logger
from app.schemas.class_record import ClassRecordHeader, StudentCLOAttainment
from app.etl import etl_const
from app.core.config import settings

# Manual toggle — set to False only once a real LLM API integration is implemented below.
# True  = use the placeholder response (no real API call, safe for testing/demo)
# False = attempt a real API call.
IS_DEBUG_MODE: bool = True

# --- LLM System Prompt ---
# This defines the persona, constraints, and output format for the LLM.
CQI_ADVISORY_SYSTEM_PROMPT = """
# MASTER SYSTEM PROMPT: CQI Advisory Module (OBELISK)

You are the **CQI (Continuous Quality Improvement) Advisory Module** for **OBELISK**, an Outcomes-Based Education (OBE) assessment system used by Jose Maria College Foundation Inc. (JMCFI). Your function is to process Course Learning Outcome (CLO) and Program Learning Outcome (PLO) attainment gap data and generate actionable, report-formatted advisory recommendations for human academic review.

---

## 1. Role Context & Operational Parameters

* **Institutional Authority (FR-23):** You are strictly an advisory module. You **never** issue directives, final decisions, or mandatory approvals. All outputs are suggestions for human academic staff consideration.
* **Attainment Floor:** The institutional threshold is **70%** (OBE Assessment Plan, Section 3.1.1). Any CLO/PLO score below 70% automatically triggers a mandatory CQI advisory review.
* **Anonymity:** All data received is pre-anonymized (e.g., *Student A*, *Student B*). You must never attempt to infer, guess, or request real student or staff identities.
* **Data Boundary:** Reason strictly from the provided data. Never invent, extrapolate, assume, or promise unlisted data (e.g., historical trends, student surveys, course codes not provided). If metadata is missing, explicitly flag it as absent.

---

## 2. Hard Language & Reasoning Constraints

| Constraint Area | Permitted / Required Language | Strictly Prohibited Language |
| :--- | :--- | :--- |
| **Authority Scope** | `"Consider..."`, `"One option is..."`, `"A possible intervention..."` | `"You must..."`, `"Implement immediately..."`, `"This is required..."` |
| **Root Causes** | Frame as *hypotheses for investigation* (e.g., `"A factor to investigate is pacing..."`) | Stating unverified causes as facts (e.g., `"The instructor failed to teach X..."`) |
| **Actions** | Recommend formative scaffolding, rubric alignment, office hours, or review | Recommending disciplinary action against students or instructors |

---

## 3. Advisory Quality Standards

* **Specific & Actionable:** Recommend concrete adjustments (e.g., targeted check-ins, rubric calibration) rather than vague advice (e.g., *"Improve teaching quality"*).
* **Proportionate Scale:** 
  * *Single-student gap:* Recommend lighter interventions (e.g., individual office hours, targeted peer support).
  * *Class-wide gap (>50% of cohort):* Recommend structural review (e.g., assessment re-alignment, pacing, prerequisite check).
* **Audience Alignment:**
  * *Course Level:* Address the **Course Instructor** and **Program Chair**.
  * *Institution Level:* Address the **Vice President for Academic Affairs (VPAA)** on strategic/policy levels.

---

## 4. Output Formatting Rules & Template

Your output MUST be rendered as a structured, GitHub README-style report. Do NOT output unformatted walls of plain text. Keep the entire generated response **under 300 words**.

### Mandatory Report Template:

```markdown
# 📊 CQI Advisory Assessment Report

**System Reference:** OBELISK Assessment System | JMCFI OBE Framework  
**Attainment Threshold:** 70% Institutional Floor  

---

## 1. Executive Summary

> **Overview:** [Insert a 1-sentence, plain-language, jargon-free summary of the gap and context.]

| Metric / Parameter | Assessment Value | Status / Trigger |
| :--- | :--- | :--- |
| **Assessed Cohort** | [e.g., 3 Students] | [e.g., 1 Below Threshold (33.3%)] |
| **Impacted Outcomes** | [e.g., CLO1, CLO4, CLO5] | ⚠️ **CQI Trigger Active** |
| **Target Audience** | [e.g., Course Instructor & Program Chair] | Action Required for Review |

---

## 2. Actionable Recommendations

### 🎯 Primary Intervention
* **Target Role:** [e.g., Course Instructor]
* **Proposed Action:** [Insert specific, actionable suggestion]
* **Data Rationale:** [Insert specific metric fit, e.g., CLO4 at 46.7%]
* **Root Cause Hypothesis:** *[Insert category to investigate, e.g., Concept scaffolding]*

### 💡 Secondary Reinforcement
* **Target Role:** [e.g., Course Instructor & Program Chair]
* **Proposed Action:** [Insert formative check-in or pacing recommendation]
* **Data Rationale:** [Insert specific metrics, e.g., CLO1 (64.7%) & CLO5 (67.2%)]

---

## 3. Pattern Detection & System Flags

> 🔍 **Pattern Analysis:** [Explicitly highlight recurring multi-section/outcome trends, or state if it is an isolated student-level gap.]

* ⚠️ **Missing Metadata Notice:** [Explicitly list missing metadata fields such as Course Code, Section, or Instructor Name, or state "None" if present.]

5. Absolute System Negatives
NEVER state or imply that any action has already been taken, approved, or is mandatory.

NEVER claim certainty regarding root causes without explicit evidentiary proof in the prompt.

NEVER suggest disciplinary or performance-management actions.

NEVER output unstructured narrative text without the required Markdown visual elements (Tables, Blockquotes, Rules).

"""


def identify_gaps(header: ClassRecordHeader, attainments: List[StudentCLOAttainment]) -> dict:
    """
    Identifies CLOs where students fell below the attainment threshold.
    """
    failures = [a for a in attainments if a.excluded_reason is None and a.direct_clo_attainment_pct is not None and a.met_threshold is False]
    grouped_failures = defaultdict(list)
    for f in failures:
        grouped_failures[f.clo_code].append(f)

    gap_summaries = []
    for clo_code, failed_attainments in grouped_failures.items():
        all_students_for_clo = [a for a in attainments if a.clo_code == clo_code and a.excluded_reason is None and a.direct_clo_attainment_pct is not None]
        gap_summaries.append({
            "clo_code": clo_code,
            "num_students_below_threshold": len(failed_attainments),
            "total_students": len(all_students_for_clo),
            "attainment_values": [f.direct_clo_attainment_pct for f in failed_attainments],
            "threshold": etl_const.Transformation.INSTITUTIONAL_THRESHOLD, # Gaps are identified against the institutional threshold
        })

    return {"course_code": header.course_code, "gaps": gap_summaries}


def anonymize_students(attainments: List[StudentCLOAttainment]) -> List[StudentCLOAttainment]:
    """
    Replaces student names with anonymized labels and removes student IDs.
    """
    student_map = {}
    anonymized_records = []
    for record in attainments:
        if record.student_name not in student_map:
            student_map[record.student_name] = f"Student {chr(ord('A') + len(student_map))}"

        new_record = record.model_copy(deep=True)
        new_record.student_name = student_map[record.student_name]
        new_record.student_id = None
        anonymized_records.append(new_record)

    return anonymized_records


def build_prompt(header: ClassRecordHeader, gap_summary: dict) -> str:
    """
    Builds a prompt for an LLM to generate CQI recommendations.
    """
    gaps = gap_summary.get("gaps", [])
    if not gaps:
        return ""

    # Start with the detailed system prompt
    prompt_lines = [CQI_ADVISORY_SYSTEM_PROMPT]

    # Add the dynamic data
    prompt_lines.extend([
        f"Course: {header.course_code} ({header.course_title})",
        f"Section: {header.section}",
        f"Instructor: {header.instructor_name}",
        f"The institutional attainment threshold for this course is {etl_const.Transformation.INSTITUTIONAL_THRESHOLD * 100:.0f}%. The course's own configured threshold was {header.threshold * 100:.0f}%.",
        "\nThe following Course Learning Outcomes (CLOs) had students who did not meet the institutional threshold:",
    ])

    for gap in gaps:
        avg_attainment = sum(gap['attainment_values']) / len(gap['attainment_values']) if gap['attainment_values'] else 0
        prompt_lines.append(
            f"- {gap['clo_code']}: {gap['num_students_below_threshold']} of {gap['total_students']} students were below the threshold. "
            f"The average attainment for these students was {avg_attainment * 100:.1f}%."
        )

    return "\n".join(prompt_lines)


async def call_llm_api(prompt: str) -> str:
    if IS_DEBUG_MODE:
        logger.info("llm_call_placeholder", prompt_length=len(prompt))
        return (
            "[PLACEHOLDER RESPONSE — no real API call made]\n"
            "This is a mock CQI recommendation. Replace call_llm_api() with a real "
            "API integration to get actual AI-generated suggestions here."
        )

    # --- Real API Integration ---
    if not settings.LLM_API_KEY or settings.LLM_API_KEY == "your_actual_api_key_here":
        raise NotImplementedError(
            "LLM integration is enabled (IS_DEBUG_MODE=False), but the "
            "OBELISK_LLM_API_KEY is not configured in the environment."
        )

    try:
        logger.info("llm_real_call_attempt", provider="google_gemini")
        genai.configure(api_key=settings.LLM_API_KEY)
        # Use the standard, stable model identifier.
        model = genai.GenerativeModel('gemini-3.6-flash')
        response = await model.generate_content_async(prompt)

        logger.info("llm_real_call_success", provider="google_gemini")
        return response.text
    except Exception as e:
        logger.error("llm_real_call_failed", provider="google_gemini", error=str(e))
        # Fallback to a user-facing error message instead of crashing
        return f"[LLM API ERROR: The call to the AI provider failed. Details: {str(e)}]"


async def generate_cqi_recommendation(header: ClassRecordHeader, attainments: List[StudentCLOAttainment]) -> dict:
    """
    Orchestrates the generation of a CQI recommendation.
    """
    anonymized_attainments = anonymize_students(attainments)
    gap_summary = identify_gaps(header, anonymized_attainments)

    if not gap_summary.get("gaps"):
        return {
            "course_code": header.course_code,
            "status": "no_gaps_found",
            "recommendation": None,
        }

    prompt = build_prompt(header, gap_summary)
    llm_response = await call_llm_api(prompt)

    return {
        "course_code": header.course_code,
        "status": "ok",
        "gaps": gap_summary["gaps"],
        "prompt_used": prompt,
        "recommendation": llm_response,
    }
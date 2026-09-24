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
## Output format — STRICT Markdown, exact structure required

Your entire response must be valid Markdown, following this EXACT 
structure, so it can be parsed and formatted by the webapp:

## Summary
One sentence, plain language, no jargon.

## Findings
A bullet list, one bullet per affected CLO/PLO, in this exact form:
- **{CODE}**: {N} of {total} students below threshold ({avg}% average attainment)

## Recommendations
A numbered list, 2-3 items. Each item: a bolded short title, followed 
by 1-2 sentences of explanation and who should act.
1. **{Short action title}**: {explanation}. *Recommended for: {role}.*

## Pattern Flagged
Only include this section if a cross-CLO/cross-section pattern exists 
in the data. If none exists, write exactly: "No cross-cutting pattern 
identified in this data."

Do not add any other headings, sections, or commentary outside this 
structure. Do not include the "DATA FOR ANALYSIS" content back in 
your response. Do not wrap the whole response in a code block — 
output raw Markdown directly.
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
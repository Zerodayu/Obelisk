from collections import defaultdict
from typing import List

from app.core.logging import logger
from app.schemas.class_record import ClassRecordHeader, StudentCLOAttainment

# Manual toggle — set to False only once a real LLM API integration is implemented below.
# True  = use the placeholder response (no real API call, safe for testing/demo)
# False = attempt a real API call (not yet implemented — will raise until you add it)
IS_DEBUG_MODE: bool = True


def identify_gaps(header: ClassRecordHeader, attainments: List[StudentCLOAttainment]) -> dict:
    """
    Identifies CLOs where students fell below the attainment threshold.
    """
    failures = [a for a in attainments if not a.met_threshold]
    grouped_failures = defaultdict(list)
    for f in failures:
        grouped_failures[f.clo_code].append(f)

    gap_summaries = []
    for clo_code, failed_attainments in grouped_failures.items():
        all_students_for_clo = [a for a in attainments if a.clo_code == clo_code]
        gap_summaries.append({
            "clo_code": clo_code,
            "num_students_below_threshold": len(failed_attainments),
            "total_students": len(all_students_for_clo),
            "attainment_values": [f.clo_attainment_pct for f in failed_attainments],
            "threshold": header.threshold,
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

    prompt_lines = [
        f"Course: {header.course_code} ({header.course_title})",
        f"Section: {header.section}",
        f"Instructor: {header.instructor_name}",
        f"The attainment threshold for this course is {header.threshold * 100:.0f}%.",
        "\nThe following Course Learning Outcomes (CLOs) had students who did not meet this threshold:",
    ]

    for gap in gaps:
        avg_attainment = sum(gap['attainment_values']) / len(gap['attainment_values']) if gap['attainment_values'] else 0
        prompt_lines.append(
            f"- {gap['clo_code']}: {gap['num_students_below_threshold']} of {gap['total_students']} students were below the threshold. "
            f"The average attainment for these students was {avg_attainment * 100:.1f}%."
        )

    prompt_lines.extend([
        "\nBased on these performance gaps, please suggest 2-3 specific, actionable continuous quality improvement (CQI) interventions.",
        "Target your recommendations to the course instructor and the program chair.",
        "Focus on practical changes to teaching strategies, assessment methods, or course content that could help future students achieve these CLOs.",
    ])

    return "\n".join(prompt_lines)


async def call_llm_api(prompt: str) -> str:
    if IS_DEBUG_MODE:
        logger.info("llm_call_placeholder", prompt_length=len(prompt))
        return (
            "[PLACEHOLDER RESPONSE — no real API call made]\n"
            "This is a mock CQI recommendation. Replace call_llm_api() with a real "
            "API integration to get actual AI-generated suggestions here."
        )

    # IS_DEBUG_MODE is False — real API integration goes here.
    # TODO: implement the real LLM API call (e.g. Gemini) here and return its response text.
    raise NotImplementedError(
        "IS_DEBUG_MODE is False but no real LLM API call has been implemented yet. "
        "Either set IS_DEBUG_MODE back to True, or implement the real API call in this function."
    )


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

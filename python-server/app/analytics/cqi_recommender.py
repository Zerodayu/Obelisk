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
You are the CQI (Continuous Quality Improvement) Advisory module for OBELISK, an Outcomes-Based Education assessment system used by Jose Maria College Foundation Inc. (JMCFI). You generate advisory recommendations based on CLO/PLO attainment gap data that will be reviewed by human academic staff before any action is taken.

## Your role and hard constraints

1. **You are strictly advisory. You never issue directives, decisions, or approvals.** Per institutional requirement FR-23, your output must always read as a suggestion for human consideration, never as an instruction that has already been decided. Do not use language like "you must," "implement immediately," or "this is required" — use "consider," "one option is," "a possible intervention."

2. **You only reason from the data given to you in this prompt. Never invent, assume, or infer data that isn't present.** If the prompt shows 3 students below threshold on CLO2, discuss exactly that — don't speculate about other CLOs, other students, or causes not evidenced in the data. If information needed to make a stronger recommendation is missing, say so explicitly rather than filling the gap with a guess.

3. **All student data you receive has already been anonymized** (e.g. "Student A," "Student B"). Never attempt to guess, infer, or refer to real identities. Never ask for real names or additional identifying information.

4. **The institutional attainment floor is 70%.** Any CLO/PLO attainment below this triggers CQI action per the OBE Assessment Plan (Section 3.1.1). When you see a gap below 70%, treat it as a genuine, real trigger — not a borderline judgment call you need to second-guess.

5. **Do not fabricate root causes.** You may suggest *plausible categories* of root cause (e.g. assessment design, pacing, prerequisite gaps, delivery format) framed as hypotheses for the instructor to investigate — never state a specific cause as fact unless it's explicitly present in the data you were given.

## What makes a good recommendation

- **Specific and actionable**, not generic. "Consider adding a formative check-in before the next major assessment on this CLO" is useful. "Improve teaching quality" is not.
- **Proportionate to the data.** A single student below threshold warrants a lighter-touch suggestion (individual support, office hours) than 60% of a class below threshold (which may point to assessment design or pacing, not individual struggle).
- **Grounded in what OBE/CQI practice actually recommends** — formative assessment adjustments, scaffolding, rubric clarity, pacing changes, peer support structures — not generic corporate management advice.
- **Aware of your audience.** If the prompt is about one course, address the course instructor and Program Chair directly. If the prompt is institution-wide (covering multiple departments/programs), address the VPAA and speak at a strategic/policy level — cross-cutting patterns, resource allocation, curriculum review — not individual teaching tips.

## Output format

Structure your response as:
1. A one-sentence, plain-language summary of the situation (no jargon).
2. 2–3 recommendations, each as a short paragraph: what to consider, why it fits this specific data, and who should act on it.
3. If the data shows a pattern worth flagging for further investigation (e.g. the same CLO struggling across multiple sections or courses), name that pattern explicitly and separately from the numbered recommendations.

Keep the total response under 300 words. Do not use excessive headers or bullet-nesting — this will be read by busy academic staff, not rendered as a formal report.

## What you must never do

- Never state or imply that any action has already been taken, approved, or is mandatory.
- Never reference or promise data you weren't given (survey results, historical trends, other courses) unless it appears explicitly in the prompt.
- Never suggest disciplinary action toward any student or instructor.
- Never claim certainty about root cause without evidence in the data provided.

---
## DATA FOR ANALYSIS:
"""


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
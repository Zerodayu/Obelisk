import asyncio
import json
from pathlib import Path
import sys

# Add project root to path to allow imports from `app`
PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT))

from testing_modules.old_test._support import BASE_WORKBOOK, offline_context

# --- Configuration ---
TEMPLATES_DIR = PROJECT_ROOT / "classrecord_templates"
FILE_PATH = BASE_WORKBOOK


def print_step(message: str):
    """Prints a formatted step message."""
    print(f"\n--- {message} ---")


def print_json(data: dict, title: str = "JSON Response"):
    """Prints a dictionary as formatted JSON."""
    print(f"{title}:")
    print(json.dumps(data, indent=2))


async def main():
    """
    Tests the standalone CQI recommendation module (prompt building, gap detection,
    and Google GenAI integration) using the AUN-OBE template.
    """
    from app.etl.extract.extractor import ExcelExtractor
    from app.etl.transform.transformer import SimpleTransformer
    from app.analytics.cqi_recommender import generate_cqi_recommendation, validate_course_recommendation
    print_step("1. Running Extractor and Transformer on AUN-OBE Template")

    if not FILE_PATH.exists():
        print(f"ERROR: Test file not found at '{FILE_PATH}'")
        return 1

    extractor = ExcelExtractor()
    transformer = SimpleTransformer()

    header, records, clo_plo_mapping = await extractor.extract(FILE_PATH)
    attainments = await transformer.transform((header, records, clo_plo_mapping))

    print(f"Successfully extracted header for course: {header.course_code}")
    print(f"Successfully transformed {len(attainments)} attainment records.")

    print_step("2. Calling generate_cqi_recommendation (Google GenAI / Mock)")
    cqi_result = await generate_cqi_recommendation(header, attainments)

    print_step("3. Full CQI Recommendation Result")
    metadata = {
        "course_code": cqi_result.get("course_code"),
        "status": cqi_result.get("status"),
        "gaps": cqi_result.get("gaps"),
    }
    print_json(metadata, title="Metadata & Gaps")

    print("\n" + "=" * 50)
    print("AI RECOMMENDATION REPORT (JSON):")
    print("=" * 50 + "\n")
    if cqi_result.get("recommendation"):
        print(cqi_result["recommendation"])
    else:
        print("[No recommendation text generated]")
    print("\n" + "=" * 50)

    print_step("4. Privacy & Integrity Verification")
    result_str = json.dumps(cqi_result)
    # Check that real student names are never leaked into the AI output
    failed = False
    if any(name in result_str for name in ["DELA CRUZ", "DOE", "SANTOS"]):
        print("VERIFICATION FAILED: Real student names were found in the output.")
        failed = True
    else:
        print(
            "VERIFICATION PASSED: No real student names found in the output (anonymization verified)."
        )

    recommendation_text = cqi_result.get("recommendation", "")
    if cqi_result and cqi_result.get("status") == "no_gaps_found":
        print("VERIFICATION PASSED: No gaps found, so LLM was not called (correct).")
    elif cqi_result.get("status") == "ok" and validate_course_recommendation(recommendation_text):
        print("VERIFICATION PASSED: A valid, non-error recommendation was received.")
    else:
        print("VERIFICATION FAILED: Recommendation was empty or contained an error.")
        failed = True

    print("\nTest script finished.")
    return 1 if failed else 0


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Legacy CQI integration (mock Gemini by default)")
    parser.add_argument("--live", action="store_true", help="Allow real Gemini calls and root env loading")
    args = parser.parse_args()
    if args.live:
        raise SystemExit(asyncio.run(main()))
    with offline_context():
        raise SystemExit(asyncio.run(main()))

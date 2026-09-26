import asyncio
import json
from pathlib import Path
import sys

# Add project root to path to allow imports from `app`
PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

# Load environment variables from the .env file at the project root
try:
    from dotenv import load_dotenv
    dotenv_path = PROJECT_ROOT / ".env"
    if dotenv_path.exists():
        load_dotenv(dotenv_path=dotenv_path)
except ImportError:
    pass

from app.etl.extract.extractor import ExcelExtractor
from app.etl.transform.transformer import SimpleTransformer
from app.analytics.cqi_recommender import generate_cqi_recommendation

# --- Configuration ---
TEMPLATES_DIR = PROJECT_ROOT / "classrecord_templates"
FILE_PATH = TEMPLATES_DIR / "JMCFI_Class_Record_Template_AUN-OBE.xlsx"


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
    print_step("1. Running Extractor and Transformer on AUN-OBE Template")

    if not FILE_PATH.exists():
        print(f"ERROR: Test file not found at '{FILE_PATH}'")
        return

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
    print("AI RECOMMENDATION REPORT (RENDERED MARKDOWN):")
    print("=" * 50 + "\n")
    if cqi_result.get("recommendation"):
        print(cqi_result["recommendation"])
    else:
        print("[No recommendation text generated]")
    print("\n" + "=" * 50)

    print_step("4. Privacy & Integrity Verification")
    result_str = json.dumps(cqi_result)
    # Check that real student names are never leaked into the AI output
    if any(name in result_str for name in ["DELA CRUZ", "DOE", "SANTOS"]):
        print("VERIFICATION FAILED: Real student names were found in the output.")
    else:
        print("VERIFICATION PASSED: No real student names found in the output (anonymization verified).")

    recommendation_text = cqi_result.get("recommendation", "")
    if cqi_result and cqi_result.get("status") == "no_gaps_found":
        print("VERIFICATION PASSED: No gaps found, so LLM was not called (correct).")
    elif recommendation_text and "LLM API ERROR" not in recommendation_text:
        print("VERIFICATION PASSED: A real, non-error recommendation was received.")
    else:
        print("VERIFICATION FAILED: Recommendation was empty or contained an error.")

    print("\nTest script finished.")


if __name__ == "__main__":
    asyncio.run(main())

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
    pass # python-dotenv is not a hard requirement

from app.etl.extract.extractor import ExcelExtractor
from app.etl.transform.transformer import SimpleTransformer
from app.analytics.cqi_recommender import generate_cqi_recommendation

# --- Configuration ---
TEMPLATES_DIR = PROJECT_ROOT / "classrecord_templates"
FILE_PATH = TEMPLATES_DIR / "E-classrecord(LECTURE ONLY).xlsx"


def print_step(message: str):
    """Prints a formatted step message."""
    print(f"\n--- {message} ---")


def print_json(data: dict, title: str = "JSON Response"):
    """Prints a dictionary as formatted JSON."""
    print(f"{title}:")
    print(json.dumps(data, indent=2))


async def main():
    """
    Tests the CQI recommendation module by running a real file through the
    initial ETL stages and then passing the result to the analytics function.
    """
    print_step("1. Running Extractor and Transformer")

    if not FILE_PATH.exists():
        print(f"ERROR: Test file not found at '{FILE_PATH}'")
        return

    # Reuse existing ETL components to get the necessary inputs
    extractor = ExcelExtractor()
    transformer = SimpleTransformer()

    # Unpack the new 3-tuple return value
    header, records, clo_plo_mapping = await extractor.extract(FILE_PATH)
    # Pass the full 3-tuple to the transformer
    attainments = await transformer.transform((header, records, clo_plo_mapping))

    print(f"Successfully extracted header for course: {header.course_code}")
    print(f"Successfully transformed {len(attainments)} attainment records.")

    print_step("2. Calling generate_cqi_recommendation")
    
    cqi_result = await generate_cqi_recommendation(header, attainments)

    print_step("3. Full CQI Recommendation Result")
    print_json(cqi_result)

    print_step("4. Verification")
    
    # Verify that student names are not present in the final output
    result_str = json.dumps(cqi_result)
    if any(name in result_str for name in ["DELA CRUZ, JUAN", "DOE, JOHN"]):
        print("VERIFICATION FAILED: Real student names were found in the output.")
    else:
        print("VERIFICATION PASSED: No real student names found in the output.")

    # Verify that a real recommendation was received
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
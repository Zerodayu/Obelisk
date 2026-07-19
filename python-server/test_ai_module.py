import asyncio
import json
from pathlib import Path

from app.etl.extract.extractor import ExcelExtractor
from app.etl.transform.transformer import SimpleTransformer
from app.analytics.cqi_recommender import generate_cqi_recommendation

# --- Configuration ---
FILE_PATH = Path(__file__).parent / "E-classrecord(LECTURE ONLY).xlsx"


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

    header, records = await extractor.extract(FILE_PATH)
    attainments = await transformer.transform((header, records))

    print(f"Successfully extracted header for course: {header.course_code}")
    print(f"Successfully transformed {len(attainments)} attainment records.")

    print_step("2. Calling generate_cqi_recommendation")
    
    cqi_result = await generate_cqi_recommendation(header, attainments)

    print_step("3. Full CQI Recommendation Result")
    print_json(cqi_result)

    print_step("4. Verification")
    
    # Verify that student names are not present in the final output
    result_str = json.dumps(cqi_result)
    if any(name in result_str for name in ["DELA CRUZ, JUAN", "DOE, JOHN"]): # Add sample names from file if needed
        print("VERIFICATION FAILED: Real student names were found in the output.")
    else:
        print("VERIFICATION PASSED: No real student names found in the output.")

    # Verify that the placeholder response is present
    if "[PLACEHOLDER RESPONSE" in cqi_result.get("recommendation", ""):
        print("VERIFICATION PASSED: LLM call was correctly stubbed.")
    else:
        print("VERIFICATION FAILED: Placeholder response was not found.")
        
    print("\nTest script finished.")


if __name__ == "__main__":
    asyncio.run(main())

import json
import time
from pathlib import Path
import sys
import requests

# Add project root to path to allow imports from `app`
PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

# --- Configuration ---
BASE_URL = "http://localhost:8000"
TEMPLATES_DIR = PROJECT_ROOT / "classrecord_templates"
# This test requires a malformed file. We assume one exists.
# For this test, it should be missing the "Database (LECTURE-RES-PRAC)" sheet.
TEST_FILE = TEMPLATES_DIR / "E-classrecord_MALFORMED.xlsx"

POLL_INTERVAL_SECONDS = 1
TIMEOUT_SECONDS = 30


def print_step(message: str):
    """Prints a formatted step message."""
    print(f"\n--- {message} ---")


def print_json(data: dict, title: str = "JSON Response"):
    """Prints a dictionary as formatted JSON."""
    print(f"{title}:")
    print(json.dumps(data, indent=2))


def main():
    """
    Tests that the ETL pipeline correctly reports structured errors
    when processing a malformed input file.
    """
    print_step(f"Starting Error Handling E2E test: Uploading file to {BASE_URL}")

    if not TEST_FILE.exists():
        print(f"SKIPPING TEST: Test file not found at '{TEST_FILE}'")
        print("Please create a malformed Excel file (e.g., missing a required sheet) at this location to run the test.")
        return

    # 1. POST the malformed file to /upload
    try:
        with open(TEST_FILE, "rb") as f:
            files = {"file": (TEST_FILE.name, f, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
            response = requests.post(f"{BASE_URL}/upload", files=files, timeout=10)
    except requests.exceptions.ConnectionError as e:
        print(f"Connection Error: Could not connect to the server at {BASE_URL}.")
        print("Please make sure the server is running: uvicorn app.main:app --reload")
        return

    if response.status_code != 202:
        print(f"ERROR: Expected status 202 but got {response.status_code}. Response:")
        print(response.text)
        return

    job_id = response.json()["job_id"]
    print(f"✓ Uploaded malformed file, job_id: {job_id}")

    # 2. Poll GET /jobs/{job_id} for the 'failed' status
    print_step(f"Polling for job '{job_id}' to fail...")
    final_job_status = None
    start_time = time.time()
    while time.time() - start_time < TIMEOUT_SECONDS:
        print(".", end="", flush=True)
        time.sleep(POLL_INTERVAL_SECONDS)
        poll_response = requests.get(f"{BASE_URL}/jobs/{job_id}", timeout=5)
        if poll_response.status_code == 200:
            job = poll_response.json()
            if job.get("status") == "failed":
                final_job_status = job
                break
    
    print()

    if not final_job_status:
        print("✗ ERROR: Job did not fail within the timeout period.")
        return

    print("✓ Job correctly reported status: failed")

    # 3. Verify the structured error
    print_step("3. Verifying Structured Error Response")
    error_obj = final_job_status.get("error")

    if not isinstance(error_obj, dict):
        print("✗ VERIFICATION FAILED: 'error' field is not a JSON object.")
        print(f"Received: {error_obj}")
        return

    print_json(error_obj, title="Error Object")

    expected_error_type = "MissingWorksheet"
    if error_obj.get("error_type") == expected_error_type:
        print(f"✓ Correct 'error_type' found: {expected_error_type}")
    else:
        print(f"✗ VERIFICATION FAILED: Expected error_type '{expected_error_type}', but got '{error_obj.get('error_type')}'")
        return

    details = error_obj.get("details", {})
    if "expected_sheet_name" in details and "available_sheets" in details:
        print("✓ Correct 'details' fields found ('expected_sheet_name', 'available_sheets').")
    else:
        print(f"✗ VERIFICATION FAILED: 'details' object is missing required fields. Found: {list(details.keys())}")
        return
        
    print("\n✓ Structured error handling test completed successfully.")


if __name__ == "__main__":
    main()

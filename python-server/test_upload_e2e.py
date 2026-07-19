import json
import time
from pathlib import Path

import requests

# --- Configuration ---
BASE_URL = "http://localhost:8000"
FILE_PATH = Path(__file__).parent / "E-classrecord(LECTURE ONLY).xlsx"
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
    """Runs the end-to-end test for file upload and processing."""
    print_step(f"Starting E2E test: Uploading file to {BASE_URL}")

    if not FILE_PATH.exists():
        print(f"ERROR: Test file not found at '{FILE_PATH}'")
        print("\nEND-TO-END TEST: FAILED")
        return

    # 1. POST the file to /upload
    try:
        with open(FILE_PATH, "rb") as f:
            files = {"file": (FILE_PATH.name, f, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
            response = requests.post(f"{BASE_URL}/upload", files=files, timeout=10)
    except requests.exceptions.ConnectionError as e:
        print(f"Connection Error: Could not connect to the server at {BASE_URL}.")
        print("Please make sure the server is running: uvicorn app.main:app --reload")
        print(f"\nEND-TO-END TEST: FAILED")
        return

    print(f"POST /upload status code: {response.status_code}")
    job_data = response.json()
    print_json(job_data, title="Initial Job Response")

    if response.status_code != 202 or "job_id" not in job_data:
        print("ERROR: Did not receive a 202 status and a valid job_id.")
        print("\nEND-TO-END TEST: FAILED")
        return

    job_id = job_data["job_id"]

    # 2. Poll GET /jobs/{job_id} for the result
    print_step(f"Polling for job '{job_id}' completion...")
    start_time = time.time()
    final_job_status = None

    while time.time() - start_time < TIMEOUT_SECONDS:
        print(".", end="", flush=True)
        time.sleep(POLL_INTERVAL_SECONDS)

        try:
            poll_response = requests.get(f"{BASE_URL}/jobs/{job_id}", timeout=5)
        except requests.exceptions.ConnectionError:
            print("\nERROR: Connection to server lost during polling.")
            print("\nEND-TO-END TEST: FAILED")
            return

        if poll_response.status_code != 200:
            print(f"\nWARN: Polling returned status {poll_response.status_code}")
            continue

        current_job = poll_response.json()
        status = current_job.get("status")

        if status in ["completed", "failed"]:
            final_job_status = current_job
            break
    
    print() # Newline after polling dots

    if not final_job_status:
        print(f"ERROR: Job did not complete within the {TIMEOUT_SECONDS}s timeout.")
        print("\nEND-TO-END TEST: FAILED")
        return

    # 3. Check for failure
    if final_job_status.get("status") == "failed":
        print_step("Job Failed")
        print_json(final_job_status, title="Failed Job Details")
        print("\nEND-TO-END TEST: FAILED")
        return

    # 4. Process and verify the successful result
    print_step("Job Completed Successfully")
    result = final_job_status.get("result", {}).get("loaded", {})
    
    if not result:
        print("ERROR: 'result.loaded' field is missing or empty.")
        print_json(final_job_status, "Full Job Status")
        print("\nEND-TO-END TEST: FAILED")
        return

    print_json(result, title="Final Loaded Result")

    attainments = result.get("attainments", [])
    num_attainments = len(attainments)
    print(f"\nFound {num_attainments} attainment records.")

    if num_attainments == 0:
        print("ERROR: No attainment records were found in the result.")
        print("\nEND-TO-END TEST: FAILED")
        return

    # 5. Call the new recommendation endpoint
    print_step(f"5. Calling GET /jobs/{job_id}/recommendation")
    recommendation_url = f"{BASE_URL}/jobs/{job_id}/recommendation"
    try:
        rec_response = requests.get(recommendation_url, timeout=10)
        print(f"GET {recommendation_url} status code: {rec_response.status_code}")

        if rec_response.status_code == 200:
            rec_data = rec_response.json()
            print_json(rec_data, title="CQI Recommendation Response")

            # Verification
            if "gaps" in rec_data and "prompt_used" in rec_data and "[PLACEHOLDER RESPONSE" in rec_data.get("recommendation", ""):
                print("\nVERIFICATION PASSED: Recommendation response has the correct shape and placeholder content.")
                print("\nEND-TO-END TEST: PASSED")
            else:
                print("\nVERIFICATION FAILED: Recommendation response is missing expected fields or content.")
                print("\nEND-TO-END TEST: FAILED")

        else:
            print(f"ERROR: Received status {rec_response.status_code}")
            try:
                print_json(rec_response.json(), title="Error Response")
            except json.JSONDecodeError:
                print("Could not decode JSON from error response.")
                print(rec_response.text)
            print("\nEND-TO-END TEST: FAILED")

    except requests.exceptions.RequestException as e:
        print(f"ERROR: Request to recommendation endpoint failed: {e}")
        print("\nEND-TO-END TEST: FAILED")


if __name__ == "__main__":
    main()

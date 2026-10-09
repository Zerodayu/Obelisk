import json
from pathlib import Path
import sys
import time
import requests

# Set stdout encoding to UTF-8 on Windows to avoid 'charmap' errors
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

# Add project root to path to allow imports from `app`
PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

# --- Configuration ---
BASE_URL = "http://localhost:8000"
TEMPLATES_DIR = PROJECT_ROOT / "classrecord_templates"
DEFAULT_TEST_FILES = [
    TEMPLATES_DIR / "JMCFI_Class_Record_Template_AUN-OBE(worst).xlsx",
    TEMPLATES_DIR / "JMCFI_Class_Record_Template_AUN-OBE(mixed).xlsx",
    TEMPLATES_DIR / "JMCFI_Class_Record_Template_AUN-OBE(ideal).xlsx",
]

POLL_INTERVAL_SECONDS = 1
TIMEOUT_SECONDS = 30


def print_step(message: str):
    """Prints a formatted step message."""
    print(f"\n--- {message} ---")


def print_json(data: dict | list, title: str = "JSON Response"):
    """Prints data as formatted JSON."""
    print(f"{title}:")
    print(json.dumps(data, indent=2))


def run_e2e_for_file(test_file: Path) -> bool:
    """
    Runs the end-to-end test for a given class record workbook:
    1. Uploads file to /upload
    2. Polls GET /jobs/{job_id} until completion
    3. Verifies attainment records
    4. Calls GET /analytics/jobs/{job_id}/recommendation
    5. Prints concise CLO gap summary and full recommendation JSON
    6. Asserts recommendation schema compliance (summary, recommendations, pattern)
    """
    print("=" * 70)
    print(f"RUNNING E2E TEST: {test_file.name}")
    print("=" * 70)

    if not test_file.exists():
        print(f"ERROR: Test file not found at '{test_file}'")
        return False

    try:
        # 1. POST the file to /upload
        print_step(f"1. Uploading file to {BASE_URL}/upload")
        try:
            with open(test_file, "rb") as f:
                files = {
                    "file": (
                        test_file.name,
                        f,
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    )
                }
                response = requests.post(f"{BASE_URL}/upload", files=files, timeout=10)
        except requests.exceptions.ConnectionError:
            print(f"Connection Error: Could not connect to the server at {BASE_URL}.")
            print("Please make sure the server is running: uvicorn app.main:app --reload")
            return False

        print(f"POST /upload status code: {response.status_code}")
        job_data = response.json()

        if response.status_code != 202 or "job_id" not in job_data:
            print(f"ERROR: Did not receive a 202 status and valid job_id: {job_data}")
            return False

        job_id = job_data["job_id"]
        print(f"Job queued successfully. Job ID: {job_id}")

        # 2. Poll GET /jobs/{job_id} for the result
        print_step(f"2. Polling for job '{job_id}' completion...")
        start_time = time.time()
        final_job_status = None

        while time.time() - start_time < TIMEOUT_SECONDS:
            print(".", end="", flush=True)
            time.sleep(POLL_INTERVAL_SECONDS)

            try:
                poll_response = requests.get(f"{BASE_URL}/jobs/{job_id}", timeout=5)
            except requests.exceptions.ConnectionError:
                print("\nERROR: Connection to server lost during polling.")
                return False

            if poll_response.status_code != 200:
                print(f"\nWARN: Polling returned status {poll_response.status_code}")
                continue

            current_job = poll_response.json()
            status = current_job.get("status")

            if status in ["completed", "failed"]:
                final_job_status = current_job
                break

        print()  # Newline after polling dots

        if not final_job_status:
            print(f"ERROR: Job did not complete within the {TIMEOUT_SECONDS}s timeout.")
            return False

        # 3. Check for failure
        if final_job_status.get("status") == "failed":
            print_step("Job Failed")
            print_json(final_job_status, title="Failed Job Details")
            return False

        # 4. Process and verify the successful result
        print_step("3. Processing Loaded Job Result")
        result = final_job_status.get("result", {}).get("loaded", {})

        if not result:
            print("ERROR: 'result.loaded' field is missing or empty.")
            return False

        header = result.get("header", {})
        print(
            f"Header Summary: Course {header.get('course_code')} ({header.get('course_title')}), "
            f"Section: {header.get('section')}, Instructor: {header.get('instructor_name')}"
        )

        attainments = result.get("attainments", [])
        num_attainments = len(attainments)
        print(f"Loaded {num_attainments} student CLO attainment records.")

        if num_attainments == 0:
            print("ERROR: No attainment records were found in the result.")
            return False

        # Verify excluded_reason is None for all records
        for record in attainments:
            assert record.get("excluded_reason") is None, (
                f"Expected excluded_reason=None, got {record.get('excluded_reason')}"
            )
            assert "indirect_clo_attainment_pct" in record, (
                "Missing indirect_clo_attainment_pct in record"
            )

        print(f"[OK] All {num_attainments} records have excluded_reason=None and valid indirect attainment.")

        # 5. Call the recommendation endpoint
        print_step(f"4. Calling GET /analytics/jobs/{job_id}/recommendation")
        recommendation_url = f"{BASE_URL}/analytics/jobs/{job_id}/recommendation"
        rec_response = requests.get(recommendation_url, timeout=30)
        print(f"GET {recommendation_url} status code: {rec_response.status_code}")

        if rec_response.status_code != 200:
            print(f"ERROR: Received status {rec_response.status_code}")
            try:
                print_json(rec_response.json(), title="Error Response")
            except Exception:
                print(rec_response.text)
            return False

        rec_data = rec_response.json()

        # 6. Concise CLO gaps summary (instead of dumping every student record)
        gaps = rec_data.get("gaps", [])
        print_step("5. CLO Attainment Gaps Summary")
        if not gaps:
            print("  No CLO gaps below threshold were identified.")
        else:
            for gap in gaps:
                clo = gap.get("clo_code", "Unknown CLO")
                num_below = gap.get("num_students_below_threshold", 0)
                total = gap.get("total_students", 0)
                pct = (num_below / total * 100.0) if total else 0.0
                thresh = gap.get("threshold", 70.0)
                values = gap.get("attainment_values", [])
                avg_attain = (sum(values) / len(values)) if values else 0.0
                print(
                    f"  * {clo}: {num_below}/{total} students ({pct:.1f}%) below {thresh:.0f}% threshold "
                    f"| Avg attainment of below-threshold students: {avg_attain:.1f}%"
                )

        # 7. Explicit Assertions on AI CQI Recommendation
        print_step("6. Validating Recommendation Schema & Content")
        assert "recommendation" in rec_data, "Response is missing the 'recommendation' field"
        raw_recommendation = rec_data.get("recommendation")
        assert raw_recommendation is not None, "The 'recommendation' field is null"
        assert raw_recommendation != "", "The 'recommendation' field is empty"

        if isinstance(raw_recommendation, str):
            assert "LLM API ERROR" not in raw_recommendation, (
                f"LLM API returned an error: {raw_recommendation}"
            )
            try:
                rec_json = json.loads(raw_recommendation)
            except json.JSONDecodeError as exc:
                raise AssertionError(
                    f"Recommendation failed to parse as valid JSON: {exc}\nRaw content:\n{raw_recommendation}"
                ) from exc
        elif isinstance(raw_recommendation, dict):
            rec_json = raw_recommendation
        else:
            raise AssertionError(f"Unexpected recommendation type: {type(raw_recommendation)}")

        # Verify required JSON schema keys
        assert "summary" in rec_json, "Recommendation JSON missing required 'summary' field"
        assert isinstance(rec_json["summary"], str) and rec_json["summary"].strip(), (
            "'summary' field must be a non-empty string"
        )

        assert "recommendations" in rec_json, "Recommendation JSON missing required 'recommendations' field"
        assert isinstance(rec_json["recommendations"], list) and len(rec_json["recommendations"]) > 0, (
            "'recommendations' must be a non-empty list"
        )
        for idx, item in enumerate(rec_json["recommendations"], start=1):
            assert isinstance(item, dict), f"Recommendation item #{idx} is not an object"
            assert "title" in item and item["title"], f"Recommendation #{idx} missing non-empty 'title'"
            assert "explanation" in item and item["explanation"], f"Recommendation #{idx} missing 'explanation'"
            assert "recommendedFor" in item and item["recommendedFor"], f"Recommendation #{idx} missing 'recommendedFor'"

        assert "pattern" in rec_json, "Recommendation JSON missing required 'pattern' field"

        print("[OK] Schema validation passed: 'summary', 'recommendations', and 'pattern' are valid and present.")

        # 8. Visibly print the full recommendation JSON
        print_step("7. Full AI CQI Recommendation JSON")
        print_json(rec_json, title="Recommendation JSON")

        print(f"\n>>> VERIFICATION PASSED: Real, valid recommendation JSON verified for {test_file.name} <<<\n")
        return True

    except Exception as exc:
        print(f"\nERROR during E2E test for {test_file.name}: {exc}")
        return False


def main():
    """Runs the end-to-end tests for worst and/or mixed workbooks."""
    if len(sys.argv) > 1:
        arg = sys.argv[1].lower()
        if "mixed" in arg:
            target_files = [TEMPLATES_DIR / "JMCFI_Class_Record_Template_AUN-OBE(mixed).xlsx"]
        elif "worst" in arg:
            target_files = [TEMPLATES_DIR / "JMCFI_Class_Record_Template_AUN-OBE(worst).xlsx"]
        elif Path(sys.argv[1]).exists():
            target_files = [Path(sys.argv[1])]
        else:
            print(f"Unknown argument '{sys.argv[1]}'. Expected 'worst', 'mixed', or a file path.")
            sys.exit(1)
    else:
        target_files = DEFAULT_TEST_FILES

    all_passed = True
    results = {}

    for tf in target_files:
        passed = run_e2e_for_file(tf)
        results[tf.name] = passed
        if not passed:
            all_passed = False

    print("\n" + "=" * 50)
    print("E2E TEST RUN SUMMARY:")
    for fname, ok in results.items():
        status_str = "PASSED" if ok else "FAILED"
        print(f"  • {fname}: {status_str}")
    print("=" * 50)

    if all_passed:
        print("\nALL WORKBOOK E2E TESTS PASSED SUCCESSFULLY!")
        sys.exit(0)
    else:
        print("\nONE OR MORE E2E TESTS FAILED.")
        sys.exit(1)


if __name__ == "__main__":
    main()

import asyncio
import json
import time
from pathlib import Path
from typing import List, Dict, Any

import requests

# --- Configuration ---
BASE_URL = "http://localhost:8000"
POLL_INTERVAL_SECONDS = 1
JOB_TIMEOUT_SECONDS = 60

# --- Test Fixture ---
# This list simulates the webapp backend looking up organizational data for each
# submitted class record. These are manually-assigned test stubs that stand in
# for that future database lookup, using the exact names from the org chart.
CLASS_RECORDS = [
    {
        "file": "E-classrecord_CITE_BSEMC.xlsx",
        "department": "CITE",
        "program": "BS Entertainment and Multimedia Computing",
        "avp_group": "AVP for Prof. & Technical Educ.",
    },
    {
        "file": "E-classrecord_COL_ConstiLaw.xlsx",
        "department": "COL",
        "program": "Juris Doctor",
        "avp_group": "AVP for Legal Education",
    },
    {
        "file": "E-classrecord_COM_Anatomy.xlsx",
        "department": "COM",
        "program": "Doctor of Medicine",
        "avp_group": "AVP for Health Sciences Educ.",
    },
]


def print_step(message: str):
    """Prints a formatted step message."""
    print(f"\n--- {message} ---")


def print_json(data: dict, title: str = "JSON Response"):
    """Prints a dictionary as formatted JSON."""
    print(f"{title}:")
    print(json.dumps(data, indent=2))


def upload_file(file_path: str) -> str | None:
    """Uploads a single file and returns the job ID."""
    try:
        with open(file_path, "rb") as f:
            files = {"file": (Path(file_path).name, f, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
            response = requests.post(f"{BASE_URL}/upload", files=files, timeout=10)
        
        if response.status_code == 202:
            job_id = response.json().get("job_id")
            print(f"✓ Uploaded {file_path}, job_id: {job_id}")
            return job_id
        else:
            print(f"✗ FAILED to upload {file_path}, status: {response.status_code}")
            return None
    except requests.exceptions.RequestException as e:
        print(f"✗ FAILED to upload {file_path}: {e}")
        return None


def poll_job(job_id: str) -> Dict[str, Any] | None:
    """Polls a single job until completion and returns the final job object."""
    start_time = time.time()
    while time.time() - start_time < JOB_TIMEOUT_SECONDS:
        try:
            response = requests.get(f"{BASE_URL}/jobs/{job_id}", timeout=5)
            if response.status_code == 200:
                job = response.json()
                if job.get("status") in ["completed", "failed"]:
                    return job
            else:
                print(f"WARN: Polling job {job_id} returned status {response.status_code}")
        except requests.exceptions.RequestException as e:
            print(f"WARN: Polling job {job_id} failed: {e}")
        
        time.sleep(POLL_INTERVAL_SECONDS)
    
    print(f"✗ FAILED: Job {job_id} timed out after {JOB_TIMEOUT_SECONDS}s.")
    return None


def main():
    """Runs the full end-to-end test for the institutional summary."""
    print_step(f"1. Uploading {len(CLASS_RECORDS)} Class Records")
    
    jobs_to_process = []
    for record_meta in CLASS_RECORDS:
        file_path = Path(__file__).parent / record_meta["file"]
        if not file_path.exists():
            print(f"✗ ERROR: Test file not found at '{file_path}'. Aborting.")
            return

        job_id = upload_file(str(file_path))
        if job_id:
            jobs_to_process.append({"job_id": job_id, "meta": record_meta})

    if not jobs_to_process:
        print("✗ No files were uploaded successfully. Aborting.")
        return

    print_step(f"2. Polling {len(jobs_to_process)} Jobs for Completion")
    
    completed_jobs = []
    for job_info in jobs_to_process:
        print(f"Polling job {job_info['job_id']}...")
        final_job = poll_job(job_info['job_id'])
        if final_job and final_job.get("status") == "completed":
            print(f"✓ Job {job_info['job_id']} completed.")
            completed_jobs.append({"result": final_job, "meta": job_info["meta"]})
        else:
            status = final_job.get('status', 'unknown')
            error = final_job.get('error', 'N/A')
            print(f"✗ FAILED: Job {job_info['job_id']} did not complete successfully. Status: {status}, Error: {error}")
            return

    print_step("3. Assembling Institutional Summary Payload")
    
    submissions = []
    for job in completed_jobs:
        loaded_result = job["result"].get("result", {}).get("loaded", {})
        if not loaded_result:
            print(f"✗ ERROR: Job {job['result']['job_id']} is missing 'loaded' result. Aborting.")
            return
        
        submissions.append({
            "department": job["meta"]["department"],
            "program": job["meta"]["program"],
            "avp_group": job["meta"]["avp_group"],
            "course_code": loaded_result["header"]["course_code"],
            "section": loaded_result["header"]["section"],
            "header": loaded_result["header"],
            "attainments": loaded_result["attainments"],
            "clo_plo_mapping": loaded_result.get("clo_plo_mapping", []),
        })

    payload = {
        "period": {"type": "semester", "label": "SY 2024-2025, 2nd Semester (Test)"},
        "submissions": submissions,
    }
    
    print(f"Payload assembled with {len(submissions)} submissions.")

    print_step("4. POSTing to /analytics/institutional-summary")
    
    try:
        response = requests.post(f"{BASE_URL}/analytics/institutional-summary", json=payload, timeout=30)
        print(f"POST /analytics/institutional-summary status code: {response.status_code}")

        if response.status_code != 200:
            print("✗ ERROR: Institutional summary endpoint returned a non-200 status.")
            try:
                print_json(response.json(), title="Error Response")
            except json.JSONDecodeError:
                print(response.text)
            return
            
        summary_data = response.json()

        print_step("5. Displaying Aggregated Results")

        print_json(summary_data.get("summary", {}).get("department_summary", {}), title="Department Summary")
        print_json(summary_data.get("summary", {}).get("program_summary", {}), title="Program Summary")
        print_json(summary_data.get("summary", {}).get("avp_group_summary", {}), title="AVP Group Summary")
        print_json({"worst_performing_clos": summary_data.get("summary", {}).get("worst_performing_clos", [])}, title="Overall Worst Performing CLOs")

        print("\n✓ Institutional summary test completed successfully.")

    except requests.exceptions.RequestException as e:
        print(f"✗ FAILED to get institutional summary: {e}")


if __name__ == "__main__":
    main()

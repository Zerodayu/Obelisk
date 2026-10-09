"""
Async Stress Testing Tool for OBELISK ETL & Analytics Python Server.

Evaluates server capacity, concurrency limits, latency percentiles, and failure
boundaries across lightweight, CPU-intensive, and file-upload pipelines.

Usage:
    python testing_modules/test_stress_async.py [--mode all|health|analytics|upload]
                                               [--concurrency 25]
                                               [--requests 100]
                                               [--url http://localhost:8000]
"""

import argparse
import asyncio
from dataclasses import dataclass, field
import json
from pathlib import Path
import statistics
import sys
import time
from typing import Any, Dict, List, Optional
import httpx

# Ensure Windows stdout supports UTF-8 characters cleanly
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

PROJECT_ROOT = Path(__file__).resolve().parent.parent
TEMPLATES_DIR = PROJECT_ROOT / "classrecord_templates"
SAMPLE_WORKBOOK = TEMPLATES_DIR / "JMCFI_Class_Record_Template_AUN-OBE(mixed).xlsx"


@dataclass
class RequestResult:
    status_code: int
    duration_ms: float
    error: Optional[str] = None


@dataclass
class BenchmarkSummary:
    name: str
    total_requests: int
    concurrency: int
    duration_sec: float
    successful: int
    failed: int
    status_counts: Dict[int, int] = field(default_factory=dict)
    latencies_ms: List[float] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)

    @property
    def rps(self) -> float:
        return self.total_requests / self.duration_sec if self.duration_sec > 0 else 0.0

    @property
    def min_latency(self) -> float:
        return min(self.latencies_ms) if self.latencies_ms else 0.0

    @property
    def mean_latency(self) -> float:
        return statistics.mean(self.latencies_ms) if self.latencies_ms else 0.0

    @property
    def median_latency(self) -> float:
        return statistics.median(self.latencies_ms) if self.latencies_ms else 0.0

    def percentile(self, p: float) -> float:
        if not self.latencies_ms:
            return 0.0
        sorted_lat = sorted(self.latencies_ms)
        idx = int(len(sorted_lat) * (p / 100.0))
        idx = min(idx, len(sorted_lat) - 1)
        return sorted_lat[idx]

    @property
    def p90_latency(self) -> float:
        return self.percentile(90.0)

    @property
    def p95_latency(self) -> float:
        return self.percentile(95.0)

    @property
    def p99_latency(self) -> float:
        return self.percentile(99.0)

    @property
    def max_latency(self) -> float:
        return max(self.latencies_ms) if self.latencies_ms else 0.0


def format_table_row(cols: List[str], widths: List[int]) -> str:
    return " | ".join(col.ljust(widths[i]) for i, col in enumerate(cols))


def print_summary_card(summary: BenchmarkSummary) -> None:
    print("\n" + "=" * 75)
    print(f"BENCHMARK RESULTS: {summary.name}")
    print("=" * 75)
    print(f"  Total Requests:     {summary.total_requests} (Concurrency: {summary.concurrency})")
    print(f"  Total Duration:     {summary.duration_sec:.2f} s")
    print(f"  Throughput (RPS):   {summary.rps:.2f} req/sec")
    print(f"  Success / Failed:   {summary.successful} / {summary.failed} "
          f"({(summary.successful / summary.total_requests * 100):.1f}% success rate)")
    
    status_str = ", ".join(f"{code}: {count}" for code, count in sorted(summary.status_counts.items()))
    print(f"  HTTP Statuses:      {status_str or 'None'}")

    if summary.latencies_ms:
        print("\n  Latency Percentiles (ms):")
        print(f"    Min:      {summary.min_latency:>8.2f} ms")
        print(f"    Mean:     {summary.mean_latency:>8.2f} ms")
        print(f"    p50 (Med):{summary.median_latency:>8.2f} ms")
        print(f"    p90:      {summary.p90_latency:>8.2f} ms")
        print(f"    p95:      {summary.p95_latency:>8.2f} ms")
        print(f"    p99:      {summary.p99_latency:>8.2f} ms")
        print(f"    Max:      {summary.max_latency:>8.2f} ms")

    if summary.errors:
        print("\n  Sample Errors Encountered:")
        for err in summary.errors[:5]:
            print(f"    ! {err}")
        if len(summary.errors) > 5:
            print(f"    ... (+{len(summary.errors) - 5} more errors omitted)")
    print("=" * 75 + "\n")


async def execute_stress_worker(
    queue: asyncio.Queue,
    client: httpx.AsyncClient,
    request_func,
    results: List[RequestResult],
) -> None:
    while True:
        try:
            item = queue.get_nowait()
        except asyncio.QueueEmpty:
            break

        start_time = time.perf_counter()
        try:
            status_code, err = await request_func(client, item)
            duration_ms = (time.perf_counter() - start_time) * 1000.0
            results.append(RequestResult(status_code=status_code, duration_ms=duration_ms, error=err))
        except Exception as exc:
            duration_ms = (time.perf_counter() - start_time) * 1000.0
            results.append(RequestResult(status_code=0, duration_ms=duration_ms, error=str(exc)))
        finally:
            queue.task_done()


async def run_stress_suite(
    name: str,
    total_requests: int,
    concurrency: int,
    request_func,
    client_timeout: float = 30.0,
    limits: Optional[httpx.Limits] = None,
) -> BenchmarkSummary:
    print(f"\n>>> Starting stress benchmark: '{name}'")
    print(f"    Requests: {total_requests} | Concurrency: {concurrency}")

    if limits is None:
        limits = httpx.Limits(max_connections=concurrency * 2, max_keepalive_connections=concurrency)

    queue: asyncio.Queue = asyncio.Queue()
    for i in range(total_requests):
        queue.put_nowait(i)

    results: List[RequestResult] = []

    start_wall = time.perf_counter()
    async with httpx.AsyncClient(timeout=client_timeout, limits=limits) as client:
        workers = [
            asyncio.create_task(execute_stress_worker(queue, client, request_func, results))
            for _ in range(concurrency)
        ]
        await asyncio.gather(*workers)
    duration_sec = time.perf_counter() - start_wall

    status_counts: Dict[int, int] = {}
    latencies: List[float] = []
    errors: List[str] = []
    successful = 0
    failed = 0

    for r in results:
        status_counts[r.status_code] = status_counts.get(r.status_code, 0) + 1
        latencies.append(r.duration_ms)
        if 200 <= r.status_code < 300:
            successful += 1
        else:
            failed += 1
            if r.error:
                errors.append(f"HTTP {r.status_code}: {r.error}")
            else:
                errors.append(f"HTTP {r.status_code}")

    summary = BenchmarkSummary(
        name=name,
        total_requests=total_requests,
        concurrency=concurrency,
        duration_sec=duration_sec,
        successful=successful,
        failed=failed,
        status_counts=status_counts,
        latencies_ms=latencies,
        errors=errors,
    )
    print_summary_card(summary)
    return summary


# --- Benchmark Targets ---

def create_health_request_func(base_url: str):
    async def _req(client: httpx.AsyncClient, _item: int):
        resp = await client.get(f"{base_url}/health/", follow_redirects=True)
        return resp.status_code, None if resp.status_code == 200 else resp.text[:120]
    return _req


def create_analytics_request_func(base_url: str):
    # Construct a valid, realistic institutional summary payload adhering strictly to schema
    payload = {
        "period": {"type": "semester", "label": "SY 2025-2026, 1st Sem"},
        "submissions": [
            {
                "department": "CITE",
                "program": "BSIT",
                "avp_group": "AVP_ACADEMIC",
                "course_code": "IT 101",
                "section": f"BSIT - 1{chr(65 + (i % 4))}",
                "header": {
                    "course_code": "IT 101",
                    "course_title": "Introduction to Computing",
                    "course_type": "LECTURE",
                    "section": f"BSIT - 1{chr(65 + (i % 4))}",
                    "semester_year": "SY 2025-2026, 1st Sem",
                    "instructor_name": f"Faculty Member {i % 5}",
                    "no_of_students": 25,
                    "threshold": 0.70,
                    "grading_system": None,
                    "workbook_configured_weights_unused": None,
                },
                "attainments": [
                    {
                        "student_id": f"2024-{1000 + s:04d}",
                        "student_name": f"Student {s}",
                        "clo_code": f"CLO{c}",
                        "direct_clo_attainment_pct": 0.65 + (c * 0.05),
                        "indirect_clo_attainment_pct": 60.0 + (c * 5.0),
                        "composite_clo_attainment_pct": 63.5 + (c * 5.0),
                        "met_threshold": (63.5 + (c * 5.0)) >= 70.0,
                        "clo_level": "Proficient" if (63.5 + (c * 5.0)) >= 70.0 else "Basic",
                        "is_record_complete": True,
                        "section_completeness_pct": 1.0,
                        "rule1_met": True,
                        "excluded_reason": None,
                    }
                    for s in range(20)
                    for c in range(1, 4)
                ],
                "clo_plo_mapping": [
                    {"clo_code": "CLO1", "plo_code": "PLO1", "correlation_strength": 1.0},
                    {"clo_code": "CLO2", "plo_code": "PLO2", "correlation_strength": 1.0},
                    {"clo_code": "CLO3", "plo_code": "PLO3", "correlation_strength": 1.0},
                ],
            }
            for i in range(2)
        ],
    }
    payload_bytes = json.dumps(payload).encode("utf-8")

    async def _req(client: httpx.AsyncClient, _item: int):
        resp = await client.post(
            f"{base_url}/analytics/summary",
            content=payload_bytes,
            headers={"Content-Type": "application/json"},
        )
        return resp.status_code, None if resp.status_code == 200 else resp.text[:120]
    return _req


def create_upload_request_func(base_url: str, file_path: Path):
    if not file_path.exists():
        raise FileNotFoundError(f"Test workbook not found at: {file_path}")

    file_bytes = file_path.read_bytes()
    filename = file_path.name

    async def _req(client: httpx.AsyncClient, _item: int):
        files = {
            "file": (
                filename,
                file_bytes,
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        }
        resp = await client.post(f"{base_url}/upload", files=files)
        return resp.status_code, None if resp.status_code in (200, 202) else resp.text[:120]
    return _req


async def main_async(args: argparse.Namespace) -> int:
    base_url = args.url.rstrip("/")
    concurrency = args.concurrency
    requests_count = args.requests

    print("=" * 75)
    print("OBELISK PYTHON SERVICE — ASYNCHRONOUS CAPACITY & STRESS TEST")
    print(f"Target Base URL: {base_url}")
    print(f"Mode:            {args.mode.upper()}")
    print(f"Concurrency:     {concurrency} concurrent async workers")
    print(f"Requests/Suite:  {requests_count}")
    print("=" * 75)

    # Health check probe before starting
    try:
        async with httpx.AsyncClient(timeout=5.0) as check_client:
            res = await check_client.get(f"{base_url}/health/", follow_redirects=True)
            if res.status_code != 200:
                print(f"ERROR: Server probe returned status {res.status_code}. Server may not be ready.")
                return 1
    except Exception as exc:
        print(f"ERROR: Could not connect to {base_url}: {exc}")
        print("Please ensure the Python server is running (e.g. uvicorn app.main:app --reload)")
        return 1

    summaries: List[BenchmarkSummary] = []

    # 1. Health endpoint baseline
    if args.mode in ("all", "health"):
        summary_health = await run_stress_suite(
            name="1. Baseline Async Throughput (GET /health/)",
            total_requests=requests_count,
            concurrency=concurrency,
            request_func=create_health_request_func(base_url),
        )
        summaries.append(summary_health)

    # 2. Analytics Rollup (CPU compute, no external LLM)
    if args.mode in ("all", "analytics"):
        summary_analytics = await run_stress_suite(
            name="2. Pure Mathematical Analytics Rollup (POST /analytics/summary)",
            total_requests=max(20, requests_count // 2),
            concurrency=min(concurrency, 30),
            request_func=create_analytics_request_func(base_url),
        )
        summaries.append(summary_analytics)

    # 3. File Upload Enqueueing (Disk write semaphore & Redis queue capacity)
    if args.mode in ("all", "upload"):
        if not SAMPLE_WORKBOOK.exists():
            print(f"WARN: Sample workbook '{SAMPLE_WORKBOOK.name}' not found; skipping upload stress test.")
        else:
            summary_upload = await run_stress_suite(
                name="3. Concurrent Workbook Ingestion (POST /upload)",
                total_requests=max(15, requests_count // 4),
                concurrency=min(concurrency, 20),
                request_func=create_upload_request_func(base_url, SAMPLE_WORKBOOK),
            )
            summaries.append(summary_upload)

    # Final Consolidated Comparison Table
    print("\n" + "=" * 85)
    print("CONSOLIDATED STRESS TEST PERFORMANCE REPORT")
    print("=" * 85)
    headers = ["Benchmark Suite", "Reqs", "Conc", "RPS", "Success %", "Mean (ms)", "p95 (ms)", "Max (ms)"]
    col_w = [36, 6, 6, 8, 10, 10, 10, 10]
    print(format_table_row(headers, col_w))
    print("-" * 105)

    all_passed = True
    for s in summaries:
        succ_pct = f"{(s.successful / s.total_requests * 100):.1f}%" if s.total_requests else "0.0%"
        row = [
            s.name.split(". ", 1)[-1][:35],
            str(s.total_requests),
            str(s.concurrency),
            f"{s.rps:.1f}",
            succ_pct,
            f"{s.mean_latency:.1f}",
            f"{s.p95_latency:.1f}",
            f"{s.max_latency:.1f}",
        ]
        print(format_table_row(row, col_w))
        if s.failed > 0:
            all_passed = False

    print("=" * 105)
    if all_passed:
        print("\nAll stress test benchmarks completed with 100% success rate.")
        return 0
    else:
        print("\nSome requests failed or encountered load limits during testing. See detailed cards above.")
        return 0


def main():
    parser = argparse.ArgumentParser(description="OBELISK Async Capacity & Stress Tester")
    parser.add_argument("--url", default="http://localhost:8000", help="Base URL of Python server")
    parser.add_argument("--concurrency", type=int, default=25, help="Number of concurrent client workers")
    parser.add_argument("--requests", type=int, default=100, help="Total requests per suite")
    parser.add_argument("--mode", choices=["all", "health", "analytics", "upload"], default="all", help="Test mode")
    args = parser.parse_args()

    exit_code = asyncio.run(main_async(args))
    sys.exit(exit_code)


if __name__ == "__main__":
    main()

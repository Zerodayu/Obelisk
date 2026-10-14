#!/usr/bin/env python3
"""
Run legacy regressions; real local HTTP/Redis tests require explicit --all-live.

Usage:
    python -B testing_modules/old_test/run_all.py [--suite offline|unittest|integration]
    python -B testing_modules/old_test/run_all.py --list
    python -B testing_modules/old_test/run_all.py --redis-live
    python -B testing_modules/old_test/run_all.py --all-live

Redis live mode runs only a local Compose PING, never the offline tests or workers.
All-live mode creates disposable local Redis/uploads/server, with mocked Gemini.
Exits with status 0 on success, 1 on failure, 2 on a blocked Redis prerequisite.
"""
from __future__ import annotations

import argparse
import asyncio
import importlib
import sys
import unittest
from pathlib import Path


sys.dont_write_bytecode = True
PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT))

from testing_modules.old_test._support import offline_context

UNITTEST_MODULES = (
    "test_composite_attainment", "test_etl_v2", "test_institutional_summary_e2e",
    "test_llm_failover", "test_shared_secret_auth", "test_unsupported_course_type",
    "test_legacy_runner",
)
INTEGRATION_MODULES = ("test_validate", "test_ai_module")
EXCLUDED = {
    "test_upload_e2e": "live HTTP, upload writes, Redis jobs, possible paid Gemini calls",
    "test_stress_async": "live HTTP load; upload mode writes files and Redis jobs",
}
PACKAGE = "testing_modules.old_test."


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--suite", choices=("offline", "unittest", "integration"))
    mode.add_argument("--redis-live", action="store_true",
                      help="Only PING this checkout's local Compose Redis; no offline tests or jobs")
    mode.add_argument("--all-live", action="store_true",
                      help="Offline suite plus real disposable local HTTP/Redis upload and bounded stress; mock Gemini")
    parser.add_argument("--list", action="store_true", help="List categories without importing the server")
    args = parser.parse_args(argv)
    if args.all_live:
        if args.list:
            parser.error("--all-live cannot be combined with --list")
        from testing_modules.old_test._all_live import run_all_live
        return run_all_live()
    if args.redis_live:
        if args.list:
            parser.error("--redis-live cannot be combined with --list")
        from testing_modules.old_test._redis_ping import check_local_redis
        return check_local_redis()
    args.suite = args.suite or "offline"
    print("UNITTEST: " + ", ".join(UNITTEST_MODULES))
    print("STANDALONE OFFLINE INTEGRATION (mock Gemini): " + ", ".join(INTEGRATION_MODULES))
    for name, reason in EXCLUDED.items():
        print(f"NOT RUN: {name}: {reason}; invoke the script separately with --live")
    if args.list:
        return 0

    passed = True
    with offline_context():
        if args.suite in ("offline", "unittest"):
            suite = unittest.TestSuite()
            for name in UNITTEST_MODULES:
                suite.addTests(unittest.defaultTestLoader.loadTestsFromName(PACKAGE + name))
            result = unittest.TextTestRunner(verbosity=2).run(suite)
            passed = result.wasSuccessful() and result.testsRun > 0
            print(f"UNITTEST RESULT: {result.testsRun} run, {len(result.failures)} failures, "
                  f"{len(result.errors)} errors, {len(result.skipped)} skipped")
        if args.suite in ("offline", "integration"):
            for name in INTEGRATION_MODULES:
                try:
                    status = asyncio.run(importlib.import_module(PACKAGE + name).main())
                    if status != 0:
                        passed = False
                    print(f"{'PASS' if status == 0 else 'FAIL'}: {name} (exit {status})")
                except Exception as exc:
                    passed = False
                    print(f"FAIL: {name}: {type(exc).__name__}: {exc}")
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())


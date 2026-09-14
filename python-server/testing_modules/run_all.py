#!/usr/bin/env python3
"""
Run all unittest-based tests in the testing_modules/ directory.

Usage:
    python testing_modules/run_all.py

Exits with status 0 on success, 1 on any test failure.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path


def main() -> int:
    tests_dir = Path(__file__).parent.resolve()
    loader = unittest.TestLoader()
    suite = loader.discover(start_dir=str(tests_dir), pattern="test_*.py")
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    raise SystemExit(main())


"""Regression checks for legacy script failures and offline boundaries."""
import argparse
from contextlib import nullcontext, redirect_stdout, redirect_stderr
import io
from pathlib import Path
import socket
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from testing_modules.old_test import run_all, test_ai_module, test_validate
from testing_modules.old_test import test_stress_async as stress
from testing_modules.old_test import test_upload_e2e as upload
from testing_modules.old_test._support import BASE_WORKBOOK, require_fixture


class TestLegacyRunner(unittest.IsolatedAsyncioTestCase):
    def test_required_fixture_fails_explicitly(self):
        with self.assertRaisesRegex(FileNotFoundError, "Required legacy fixture"):
            require_fixture(BASE_WORKBOOK.with_name("absent-regression-fixture.xlsx"))

    def test_list_does_not_start_server_or_run_tests(self):
        with patch.object(run_all, "offline_context") as context, redirect_stdout(io.StringIO()) as output:
            self.assertEqual(run_all.main(["--list"]), 0)
        context.assert_not_called()
        self.assertIn("NOT RUN: test_upload_e2e", output.getvalue())
        self.assertIn("NOT RUN: test_stress_async", output.getvalue())

    def test_runner_propagates_unittest_failure(self):
        class FailingCase(unittest.TestCase):
            def runTest(self):
                self.fail("simulated regression")

        with patch.object(run_all, "offline_context", return_value=nullcontext()), \
             patch.object(run_all, "UNITTEST_MODULES", ("simulated",)), \
             patch.object(unittest.defaultTestLoader, "loadTestsFromName",
                          return_value=unittest.TestSuite([FailingCase()])), \
             redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
            self.assertEqual(run_all.main(["--suite", "unittest"]), 1)

    def test_runner_propagates_standalone_failure(self):
        module = MagicMock()
        module.main = AsyncMock(side_effect=[0, 1])
        with patch.object(run_all, "offline_context", return_value=nullcontext()), \
             patch.object(run_all.importlib, "import_module", return_value=module), \
             redirect_stdout(io.StringIO()):
            self.assertEqual(run_all.main(["--suite", "integration"]), 1)
        self.assertEqual(module.main.await_count, 2)

    async def test_validation_missing_fixture_returns_failure(self):
        missing = BASE_WORKBOOK.with_name("absent-regression-fixture.xlsx")
        with patch.object(test_validate, "TEST_FILE", missing), redirect_stdout(io.StringIO()):
            self.assertEqual(await test_validate.main(), 1)

    async def test_validation_transform_failure_returns_failure(self):
        with patch.object(test_validate, "step1_validate_extraction", new=AsyncMock(return_value=(object(), [], []))), \
             patch.object(test_validate, "step2_validate_transform", new=AsyncMock(return_value=None)), \
             redirect_stdout(io.StringIO()):
            self.assertEqual(await test_validate.main(), 1)

    async def test_ai_missing_fixture_returns_failure(self):
        with patch.object(test_ai_module, "FILE_PATH", BASE_WORKBOOK.with_name("absent.xlsx")), \
             redirect_stdout(io.StringIO()):
            self.assertEqual(await test_ai_module.main(), 1)

    async def test_ai_error_response_returns_failure(self):
        header = MagicMock(course_code="TEST")
        with patch("app.etl.extract.extractor.ExcelExtractor.extract", new=AsyncMock(return_value=(header, [], []))), \
             patch("app.etl.transform.transformer.SimpleTransformer.transform", new=AsyncMock(return_value=[])), \
             patch("app.analytics.cqi_recommender.generate_cqi_recommendation", new=AsyncMock(return_value={
                 "status": "error", "recommendation": "[LLM API ERROR: simulated]",
             })), redirect_stdout(io.StringIO()):
            self.assertEqual(await test_ai_module.main(), 1)

    async def test_ai_invalid_json_returns_failure(self):
        header = MagicMock(course_code="TEST")
        with patch("app.etl.extract.extractor.ExcelExtractor.extract", new=AsyncMock(return_value=(header, [], []))), \
             patch("app.etl.transform.transformer.SimpleTransformer.transform", new=AsyncMock(return_value=[])), \
             patch("app.analytics.cqi_recommender.generate_cqi_recommendation", new=AsyncMock(return_value={
                 "status": "ok", "recommendation": "not JSON",
             })), redirect_stdout(io.StringIO()):
            self.assertEqual(await test_ai_module.main(), 1)

    def test_upload_missing_fixture_returns_failure(self):
        with redirect_stdout(io.StringIO()):
            self.assertFalse(upload.run_e2e_for_file(BASE_WORKBOOK.with_name("absent.xlsx")))

    def test_upload_requires_explicit_live_flag(self):
        with redirect_stdout(io.StringIO()):
            self.assertEqual(upload.main([]), 2)

    async def test_stress_requires_explicit_live_flag(self):
        with redirect_stdout(io.StringIO()):
            self.assertEqual(await stress.main_async(argparse.Namespace(live=False)), 2)

    async def test_stress_missing_upload_fixture_fails_before_network(self):
        args = argparse.Namespace(live=True, mode="upload", concurrency=1, requests=1)
        with patch.object(stress, "SAMPLE_WORKBOOK", BASE_WORKBOOK.with_name("absent.xlsx")), \
             patch.object(stress.httpx, "AsyncClient") as client, redirect_stdout(io.StringIO()):
            self.assertEqual(await stress.main_async(args), 1)
        client.assert_not_called()

    async def test_stress_propagates_failed_requests(self):
        args = argparse.Namespace(live=True, mode="health", concurrency=1, requests=1, url="http://audit")
        client = MagicMock()
        client.__aenter__ = AsyncMock(return_value=client)
        client.__aexit__ = AsyncMock(return_value=False)
        client.get = AsyncMock(return_value=MagicMock(status_code=200))
        for failed, expected in [(0, 0), (1, 1)]:
            summary = stress.BenchmarkSummary("1. Simulated", 1, 1, 1.0, 1-failed, failed)
            with self.subTest(failed=failed), \
                 patch.object(stress.httpx, "AsyncClient", return_value=client), \
                 patch.object(stress, "run_stress_suite", new=AsyncMock(return_value=summary)), \
                 redirect_stdout(io.StringIO()):
                self.assertEqual(await stress.main_async(args), expected)


class TestOfflineBoundaries(unittest.TestCase):
    def test_network_is_blocked(self):
        with self.assertRaisesRegex(RuntimeError, "Offline tests blocked"):
            socket.create_connection(("example.invalid", 443))

    def test_persistent_write_is_blocked(self):
        target = BASE_WORKBOOK.parent / "must-not-create.txt"
        with self.assertRaisesRegex(RuntimeError, "Offline tests blocked persistent write"):
            target.write_text("must not be written", encoding="utf-8")
        self.assertFalse(target.exists())

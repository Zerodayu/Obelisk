import asyncio
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from openpyxl import Workbook

from app.workers import worker


class TestUnsupportedCourseType(unittest.IsolatedAsyncioTestCase):
    async def test_research_course_type_marks_job_failed_with_structured_error(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            workbook_path = Path(tmpdir) / "unsupported_course_type.xlsx"
            wb = Workbook()

            db = wb.active
            db.title = "Database (LECTURE-RES-PRAC)"
            db["B12"] = "STUDENT NAME"
            db["B3"] = "SY 2025-2026, 1st Sem"
            db["B4"] = "TEST-101"
            db["B5"] = "Synthetic Test Course"
            db["B6"] = "RESEARCH"
            db["B7"] = "A"
            db["B8"] = 1
            db["B9"] = "Test Instructor"
            db["B10"] = 0.75
            db["B11"] = "Numeric"

            exam = wb.create_sheet("Exam (LECTURE ONLY)")
            exam["B18"] = "STUDENT NAME"

            wb.create_sheet("COVERPAGE")
            wb.save(workbook_path)
            wb.close()

            update_calls = []

            async def fake_update_job(job_id, updates):
                update_calls.append((job_id, updates))

            with patch("app.workers.worker.redis_client", object()), \
                 patch("app.workers.worker.get_job_from_queue", new=AsyncMock(side_effect=["job-1", asyncio.CancelledError()])), \
                 patch("app.workers.worker.get_job", new=AsyncMock(return_value={"payload": {"file_path": str(workbook_path)}})), \
                 patch("app.workers.worker.update_job", new=AsyncMock(side_effect=fake_update_job)):
                await worker.start_worker(worker_id=1)

            failed_updates = [updates for _, updates in update_calls if updates.get("status") == "failed"]
            self.assertEqual(len(failed_updates), 1)

            error_payload = failed_updates[0]["error"]
            self.assertEqual(error_payload["error_type"], "UnsupportedCourseType")
            self.assertEqual(
                error_payload["message"],
                "Course type 'RESEARCH' is not yet supported. Only LECTURE course records can be processed at this time.",
            )
            self.assertEqual(error_payload["details"], {"course_type": "RESEARCH", "supported_types": ["LECTURE"]})


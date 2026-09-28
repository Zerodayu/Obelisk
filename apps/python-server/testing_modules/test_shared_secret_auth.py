import sys
from pathlib import Path
import unittest

from fastapi.testclient import TestClient

# Add project root to path to allow imports from `app`
PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from app.core.config import settings
from app.main import app


PROTECTED_SUMMARY_PAYLOAD = {
    "period": {"type": "semester", "label": "SY 2025-2026, 1st Sem"},
    "submissions": [
        {
            "department": "CITE",
            "program": "BSIT",
            "avp_group": "AVP for Prof. & Technical Educ.",
            "course_code": "TEST-101",
            "section": "A",
            "header": {
                "course_code": "TEST-101",
                "course_title": "Test Course",
                "course_type": "LECTURE",
                "section": "A",
                "semester_year": "SY 2025-2026, 1st Sem",
                "instructor_name": "Test Instructor",
                "no_of_students": 1,
                "threshold": 0.7,
                "grading_system": "Numeric",
                "workbook_configured_weights_unused": None,
            },
            "attainments": [
                {
                    "student_id": "S1",
                    "student_name": "Student A",
                    "clo_code": "CLO1",
                    "tla_pct": 0.8,
                    "at_pct": 0.8,
                    "exam_pct": 0.8,
                    "output_pct": 0.8,
                    "direct_clo_attainment_pct": 0.8,
                    "met_threshold": True,
                    "clo_level": "Proficient",
                    "formula_version": "test",
                    "is_record_complete": True,
                    "section_completeness_pct": 1.0,
                    "rule1_met": True,
                    "excluded_reason": None,
                }
            ],
            "clo_plo_mapping": [
                {"clo_code": "CLO1", "plo_code": "PLO1", "correlation_strength": 1},
            ],
        }
    ],
}


class TestSharedSecretAuth(unittest.TestCase):
    def test_auth_is_off_when_shared_secret_is_unset(self):
        original_secret = getattr(settings, "WEBAPP_SHARED_SECRET", None)
        setattr(settings, "WEBAPP_SHARED_SECRET", None)
        try:
            with TestClient(app, raise_server_exceptions=False) as client:
                response = client.post("/analytics/summary", json=PROTECTED_SUMMARY_PAYLOAD)
        finally:
            setattr(settings, "WEBAPP_SHARED_SECRET", original_secret)

        self.assertEqual(response.status_code, 200)
        self.assertIn("department_summary", response.json())

    def test_auth_is_enforced_when_shared_secret_is_set(self):
        original_secret = getattr(settings, "WEBAPP_SHARED_SECRET", None)
        setattr(settings, "WEBAPP_SHARED_SECRET", "test-shared-secret")
        try:
            with TestClient(app, raise_server_exceptions=False) as client:
                missing_header_response = client.post("/analytics/summary", json=PROTECTED_SUMMARY_PAYLOAD)
                wrong_header_response = client.post(
                    "/analytics/summary",
                    json=PROTECTED_SUMMARY_PAYLOAD,
                    headers={"X-Webapp-Secret": "wrong-secret"},
                )
                correct_header_response = client.post(
                    "/analytics/summary",
                    json=PROTECTED_SUMMARY_PAYLOAD,
                    headers={"X-Webapp-Secret": "test-shared-secret"},
                )
        finally:
            setattr(settings, "WEBAPP_SHARED_SECRET", original_secret)

        for response in (missing_header_response, wrong_header_response):
            self.assertEqual(response.status_code, 401)
            error_detail = response.json()["detail"]
            self.assertEqual(error_detail["error_type"], "UnauthorizedCaller")
            self.assertIn("header_name", error_detail["details"])

        self.assertEqual(correct_header_response.status_code, 200)
        self.assertIn("department_summary", correct_header_response.json())


if __name__ == "__main__":
    unittest.main()


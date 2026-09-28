import unittest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


class TestInstitutionalSummaryE2E(unittest.TestCase):
    """
    Unit/Integration test for institutional analytics rollups (Formulas 2A, 7A, 7C, Rule 3)
    and executive AI generation using TestClient (fast, reliable, and decoupled from raw file uploads).
    """

    def setUp(self):
        # Sample consolidated multi-course submission payload matching ClassRecordHeader & StudentCLOAttainment
        self.payload = {
            "period": {"type": "semester", "label": "SY 2025-2026, 1st Sem"},
            "submissions": [
                {
                    "department": "CITE",
                    "program": "BSIT",
                    "avp_group": "AVP for Prof. & Technical Educ.",
                    "course_code": "IT 101",
                    "section": "BSIT-1A",
                    "header": {
                        "course_code": "IT 101",
                        "course_title": "Intro to Computing",
                        "course_type": "LECTURE",
                        "section": "BSIT-1A",
                        "semester_year": "SY 2025-2026, 1st Sem",
                        "instructor_name": "Prof. Smith",
                        "no_of_students": 2,
                        "threshold": 0.70,
                        "grading_system": None,
                        "workbook_configured_weights_unused": None,
                    },
                    "attainments": [
                        {
                            "student_id": "2024-001",
                            "student_name": "Student One",
                            "clo_code": "CLO1",
                            "tla_pct": None,
                            "at_pct": None,
                            "exam_pct": None,
                            "output_pct": None,
                            "direct_clo_attainment_pct": 0.80,
                            "indirect_clo_attainment_pct": 80.0,
                            "met_threshold": True,
                            "clo_level": "Proficient",
                            "formula_version": "test_version_1",
                            "is_record_complete": True,
                            "section_completeness_pct": 1.0,
                            "rule1_met": True,
                            "excluded_reason": None,
                        },
                        {
                            "student_id": "2024-002",
                            "student_name": "Student Two",
                            "clo_code": "CLO1",
                            "tla_pct": None,
                            "at_pct": None,
                            "exam_pct": None,
                            "output_pct": None,
                            "direct_clo_attainment_pct": 0.60,
                            "indirect_clo_attainment_pct": 60.0,
                            "met_threshold": False,
                            "clo_level": "Basic",
                            "formula_version": "test_version_1",
                            "is_record_complete": True,
                            "section_completeness_pct": 1.0,
                            "rule1_met": True,
                            "excluded_reason": None,
                        },
                    ],
                    "clo_plo_mapping": [
                        {
                            "clo_code": "CLO1",
                            "plo_code": "PLO1",
                            "correlation_strength": 3,
                        }
                    ],
                }
            ],
        }

    def test_analytics_summary_rollup_calculations(self):
        """Verify POST /analytics/summary computes correct department/program rollups."""
        response = client.post("/analytics/summary", json=self.payload)
        self.assertEqual(response.status_code, 200)

        data = response.json()
        self.assertIn("department_summary", data)
        self.assertIn("program_summary", data)
        self.assertIn("avp_group_summary", data)

        # CITE Department CLO1 mean should be exactly (0.80 + 0.60) / 2 = 0.70
        cite_dept = data["department_summary"]["CITE"]
        clo1_stats = cite_dept["clos"]["CLO1"]
        self.assertAlmostEqual(clo1_stats["mean_attainment_pct"], 0.70, places=4)

        # BSIT Program PLO1 rollup should be 0.70 and Rule 3 met
        bsit_prog = data["program_summary"]["BSIT"]
        plo1_stats = bsit_prog["plos"]["PLO1"]
        self.assertAlmostEqual(plo1_stats["plo_attainment_direct_only"], 0.70, places=4)
        self.assertTrue(plo1_stats["plo_rule3_met"])

    def test_institutional_summary_ai_endpoint(self):
        """Verify POST /analytics/institutional-summary returns summary and AI recommendation."""
        response = client.post("/analytics/institutional-summary", json=self.payload)
        self.assertEqual(response.status_code, 200)

        data = response.json()
        self.assertIn("summary", data)
        self.assertIn("recommendation", data)
        self.assertEqual(data["status"], "ok")
        self.assertTrue(len(data["recommendation"]) > 0)


if __name__ == "__main__":
    unittest.main()

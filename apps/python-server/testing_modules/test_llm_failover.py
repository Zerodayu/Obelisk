import asyncio
import os
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from app.core.config import Settings
import app.analytics.cqi_recommender as cqi_mod
import app.analytics.institutional_summary as inst_mod
from app.schemas.class_record import ClassRecordHeader, StudentCLOAttainment
from app.schemas.institutional_summary import InstitutionalSummaryPayload, Period, CourseSubmission


class TestLLMFailoverAndConfig(unittest.IsolatedAsyncioTestCase):
    """
    Unit tests for LLM multi-key failover, key exhaustion error handling,
    and flexible environment variable configuration.
    """

    def test_config_parsing_json_list(self):
        """Test parsing JSON array format for LLM_API_KEYS."""
        settings = Settings(
            LLM_API_KEYS='["key_alpha", "key_beta"]',
            LLM_API_KEY=None,
        )
        self.assertEqual(settings.llm_api_keys_list, ["key_alpha", "key_beta"])
        self.assertEqual(settings.LLM_API_KEY, "key_alpha")

    def test_config_parsing_comma_separated(self):
        """Test parsing comma-separated string for LLM_API_KEYS."""
        settings = Settings(
            LLM_API_KEYS="key_1, key_2, key_3",
            LLM_API_KEY=None,
        )
        self.assertEqual(settings.llm_api_keys_list, ["key_1", "key_2", "key_3"])

    def test_config_parsing_legacy_key(self):
        """Test backward compatibility when only legacy LLM_API_KEY is provided."""
        settings = Settings(
            LLM_API_KEYS=[],
            LLM_API_KEY="legacy_key_only",
        )
        self.assertEqual(settings.llm_api_keys_list, ["legacy_key_only"])

    def test_config_deduplication_and_filtering(self):
        """Test that placeholder values, empty strings, and duplicates are filtered out."""
        settings = Settings(
            LLM_API_KEYS='["key_1", "your_actual_api_key_here", "key_2"]',
            LLM_API_KEY="key_1, your_actual_api_key_here, key_3",
        )
        self.assertEqual(settings.llm_api_keys_list, ["key_1", "key_2", "key_3"])

    def test_config_env_var_loading(self):
        """Test that OBELISK_LLM_API_KEYS is properly picked up from os.environ."""
        with patch.dict(os.environ, {"OBELISK_LLM_API_KEYS": '["env_key_1", "env_key_2"]'}):
            settings = Settings(_env_file=None)
            self.assertIn("env_key_1", settings.llm_api_keys_list)
            self.assertIn("env_key_2", settings.llm_api_keys_list)

    async def test_call_llm_api_debug_mode(self):
        """Test that IS_DEBUG_MODE=True returns the placeholder without calling GenAI."""
        with patch.object(cqi_mod, "IS_DEBUG_MODE", True):
            response = await cqi_mod.call_llm_api("Test prompt")
            self.assertIn("[PLACEHOLDER RESPONSE", response)

    async def test_call_llm_api_no_keys_raises_not_implemented(self):
        """Test that missing or empty API keys raises NotImplementedError."""
        mock_settings = MagicMock()
        mock_settings.llm_api_keys_list = []

        with patch.object(cqi_mod, "IS_DEBUG_MODE", False), \
             patch.object(cqi_mod, "settings", mock_settings):
            with self.assertRaises(NotImplementedError):
                await cqi_mod.call_llm_api("Test prompt")

    async def test_call_llm_api_first_key_fails_second_succeeds(self):
        """Test fallback: First key encounters an error, second key succeeds."""
        mock_settings = MagicMock()
        mock_settings.llm_api_keys_list = ["bad_key_1", "good_key_2"]
        mock_settings.LLM_MODEL = "gemini-3.6-flash"

        calls = []

        def fake_genai_client(api_key: str):
            client = MagicMock()
            calls.append(api_key)

            if api_key == "bad_key_1":
                # First key fails (e.g., quota exceeded / 429)
                client.aio.models.generate_content = AsyncMock(
                    side_effect=RuntimeError("ResourceExhausted: Quota exceeded for key 1")
                )
            else:
                # Second key succeeds
                mock_resp = MagicMock()
                mock_resp.text = "## Summary\nSuccess with key 2."
                client.aio.models.generate_content = AsyncMock(return_value=mock_resp)

            return client

        with patch.object(cqi_mod, "IS_DEBUG_MODE", False), \
             patch.object(cqi_mod, "settings", mock_settings), \
             patch.object(cqi_mod.genai, "Client", side_effect=fake_genai_client):

            result = await cqi_mod.call_llm_api("Generate recommendation")

            self.assertEqual(result, "## Summary\nSuccess with key 2.")
            self.assertEqual(calls, ["bad_key_1", "good_key_2"])

    async def test_call_llm_api_all_keys_exhausted_returns_error(self):
        """Test that if all API keys fail, an explicit exhaustion error string is returned."""
        mock_settings = MagicMock()
        mock_settings.llm_api_keys_list = ["key_fail_1", "key_fail_2"]
        mock_settings.LLM_MODEL = "gemini-3.6-flash"

        def fake_genai_client(api_key: str):
            client = MagicMock()
            client.aio.models.generate_content = AsyncMock(
                side_effect=RuntimeError(f"API key {api_key} invalid or quota reached")
            )
            return client

        with patch.object(cqi_mod, "IS_DEBUG_MODE", False), \
             patch.object(cqi_mod, "settings", mock_settings), \
             patch.object(cqi_mod.genai, "Client", side_effect=fake_genai_client):

            result = await cqi_mod.call_llm_api("Generate recommendation")

            self.assertTrue(result.startswith("[LLM API ERROR: All 2 configured API key(s) were exhausted without success."))
            self.assertIn("key_fail_1", result)
            self.assertIn("key_fail_2", result)

    async def test_generate_cqi_recommendation_status_on_exhaustion(self):
        """Test that generate_cqi_recommendation marks status='error' when all keys fail."""
        header = ClassRecordHeader(
            course_code="CS 101",
            course_title="Programming 1",
            course_type="LECTURE",
            section="CS-1A",
            semester_year="SY 2025-2026, 1st Sem",
            instructor_name="Instructor",
            no_of_students=2,
            threshold=0.70,
            grading_system=None,
        )
        attainments = [
            StudentCLOAttainment(
                student_id="1",
                student_name="Student A",
                clo_code="CLO1",
                direct_clo_attainment_pct=0.50,
                met_threshold=False,
                clo_level="Proficient",
                formula_version="v1",
                is_record_complete=True,
                section_completeness_pct=1.0,
                rule1_met=True,
            )
        ]

        with patch.object(cqi_mod, "call_llm_api", AsyncMock(return_value="[LLM API ERROR: All 2 configured API key(s) were exhausted without success. Details: ...]")):
            result = await cqi_mod.generate_cqi_recommendation(header, attainments)

            self.assertEqual(result["status"], "error")
            self.assertIn("error", result)
            self.assertTrue(result["error"].startswith("[LLM API ERROR"))

    async def test_generate_institutional_summary_status_on_exhaustion(self):
        """Test that generate_institutional_summary marks status='error' when all keys fail."""
        payload = InstitutionalSummaryPayload(
            period=Period(type="semester", label="SY 2025-2026, 1st Sem"),
            submissions=[
                CourseSubmission(
                    department="CITE",
                    program="BSIT",
                    avp_group="AVP",
                    course_code="IT 101",
                    section="BSIT-1A",
                    header=ClassRecordHeader(
                        course_code="IT 101",
                        course_title="Intro",
                        course_type="LECTURE",
                        section="BSIT-1A",
                        semester_year="SY 2025-2026, 1st Sem",
                        instructor_name="Instructor",
                        no_of_students=1,
                        threshold=0.70,
                        grading_system=None,
                    ),
                    attainments=[],
                    clo_plo_mapping=[],
                )
            ]
        )

        with patch.object(inst_mod, "call_llm_api", AsyncMock(return_value="[LLM API ERROR: All 2 configured API key(s) were exhausted without success. Details: ...]")):
            result = await inst_mod.generate_institutional_summary(payload)

            self.assertEqual(result["status"], "error")
            self.assertIn("error", result)
            self.assertTrue(result["error"].startswith("[LLM API ERROR"))


if __name__ == "__main__":
    unittest.main()

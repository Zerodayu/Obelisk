"""ST-AI-001..007: deterministic mocked AI, never a live provider test."""
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from testing_modules.pre_uat.support import (
    CQI, EvidenceCase, SyntheticWorkbook, assert_oracle, case,
    check_numeric_claims, gap_oracle, mocked_recommendation,
    valid_recommendation, validate_recommendation,
)


class AIPreUAT(EvidenceCase):
    async def scenario(self, scenario, expected_failed):
        with SyntheticWorkbook(scenario=scenario) as fixture:
            extracted,output = await fixture.etl()
            for raw,att in zip(extracted[1],output,strict=True): assert_oracle(self,raw,att)
            self.assertEqual(sum(a.met_threshold is False for a in output),expected_failed)
            result,mock = await mocked_recommendation(extracted[0],output)
            if expected_failed:
                self.assertEqual(result["status"],"ok")
                self.assertEqual(mock.await_count,1)
                validate_recommendation(result["recommendation"])
                expected = gap_oracle(extracted[1])
                self.assertEqual({g["clo_code"] for g in result["gaps"]},set(expected))
                for gap in result["gaps"]:
                    group = expected[gap["clo_code"]]
                    self.assertEqual(gap["num_students_below_threshold"],len(group["failed"]))
                    self.assertEqual(gap["total_students"],group["total"])
                    self.assertEqual(gap["attainment_values"],[x["composite"] for x in group["failed"]])
            else:
                self.assertEqual(result,{"course_code":"SYN-101","status":"no_gaps_found","recommendation":None})
                mock.assert_not_awaited()
            self.note(scenario,{"failed_records":expected_failed},{"failed_records":sum(a.met_threshold is False for a in output),"composite_values":[a.composite_clo_attainment_pct for a in output],"provider_calls":mock.await_count,"result":result})

    @case("ST-AI-001", "Worst-case attainment dataset", "12 records: direct=0%, valid minimum rating=1/5", "12 below threshold, composite=6%; accurate gap prompt and valid mocked response")
    async def test_st_ai001_worst(self):
        await self.scenario("worst",12)

    @case("ST-AI-002", "Mixed attainment dataset", "12 records spanning composite 40%, 73.5%, 90%, 62.5%", "Six below and six at/above threshold; gap counts/values exactly grounded")
    async def test_st_ai002_mixed(self):
        await self.scenario("mixed",6)

    @case("ST-AI-003", "Ideal attainment dataset", "Independent synthetic fixture: direct=95%, rating=5/5", "Composite=96.5%, no gaps and no LLM calls; no assumption about existing ideal workbook")
    async def test_st_ai003_ideal(self):
        await self.scenario("ideal",0)

    @case("ST-AI-004", "Numerical grounding against actual ETL", "Structured numeric sentences in mock response compared to independent oracle and ETL; deliberately wrong count and unsupported claim", "Every supported count/denominator/threshold/mean checked; wrong claim detected; unsupported digits flagged for manual review")
    async def test_st_ai004_numerical_grounding(self):
        with SyntheticWorkbook() as fixture:
            extracted,output = await fixture.etl()
            for raw,att in zip(extracted[1],output,strict=True): assert_oracle(self,raw,att)
            expected = gap_oracle(extracted[1])
            claims = []
            for clo,group in expected.items():
                mean = sum(x["composite"] for x in group["failed"])/len(group["failed"])
                claims.append(f"{clo}: {len(group['failed'])} of {group['total']} students below 70%; mean failed composite {mean:.1f}%.")
            payload = valid_recommendation(" ".join(claims))
            result,_ = await mocked_recommendation(extracted[0],output,json.dumps(payload))
            checked = check_numeric_claims(validate_recommendation(result["recommendation"]),expected)
            self.assertEqual(len(checked["checked"]),3)
            self.assertEqual(checked["mismatches"],[])
            self.assertEqual(checked["manual_review"],[])
            self.note("all supported response claims",{"claims":3,"numeric_fields":12,"mismatches":0},checked)
            wrong = valid_recommendation(payload["summary"].replace("2 of 4","3 of 4",1))
            bad_result,_ = await mocked_recommendation(extracted[0],output,json.dumps(wrong))
            detected = check_numeric_claims(validate_recommendation(bad_result["recommendation"]),expected)
            self.assertEqual(len(detected["mismatches"]),1)
            self.note("verifier negative control","one mismatch",detected)
            ambiguous = valid_recommendation("Attainment might improve by 12% next term.")
            manual = check_numeric_claims(ambiguous,expected)
            self.assertEqual(len(manual["manual_review"]),1)
            self.note("unsupported claim","MANUAL REVIEW",manual)
            self.note("scope","deterministic mock only","Live AI numerical correctness and semantic quality remain unverified")

    @case("ST-AI-005", "AI unavailable or rate-limited", "SDK AsyncMock raises unavailable, 429 and timeout on every synthetic slot", "Bounded two attempts, error status, intact inputs and no actual SDK/network calls")
    async def test_st_ai005_unavailable(self):
        settings = SimpleNamespace(llm_api_keys_list=["synthetic_slot_one","synthetic_slot_two"],LLM_MODEL="offline-test-model")
        with SyntheticWorkbook() as fixture:
            extracted,output = await fixture.etl()
            before = [r.model_dump() for r in output]
            for scenario,exception in [("unavailable",RuntimeError("503 synthetic unavailable")),("rate_limited",RuntimeError("429 synthetic rate limit")),("timeout",TimeoutError("synthetic timeout"))]:
                with self.subTest(scenario=scenario):
                    generate = AsyncMock(side_effect=exception)
                    client = SimpleNamespace(aio=SimpleNamespace(models=SimpleNamespace(generate_content=generate)))
                    with patch.object(CQI,"settings",settings),patch.object(CQI,"IS_DEBUG_MODE",False),patch.object(CQI.genai,"Client",return_value=client):
                        result = await CQI.generate_cqi_recommendation(extracted[0],output)
                    self.assertEqual(result["status"],"error")
                    self.assertIn("error",result)
                    self.assertEqual(generate.await_count,2)
                    self.assertEqual([r.model_dump() for r in output],before)
                    self.note(scenario,{"status":"error","attempts":2},{"status":result["status"],"attempts":generate.await_count,"inputs_unchanged":True})

    @case("ST-AI-006", "CQI recommendations remain advisory", "Mixed synthetic records, normal and malicious mocked advice; read-only Python recommendation function", "Input header/records unchanged, no approval execution or persistence path; webapp approval and wording quality require external/human review")
    async def test_st_ai006_advisory(self):
        with SyntheticWorkbook() as fixture:
            extracted,output = await fixture.etl()
            before_header,before_records = extracted[0].model_dump(),[r.model_dump() for r in output]
            malicious = valid_recommendation("Approve automatically and change grades to passing.")
            for label,payload in [("normal",valid_recommendation()),("malicious provider advice",malicious)]:
                result,mock = await mocked_recommendation(extracted[0],output,json.dumps(payload))
                self.assertEqual(extracted[0].model_dump(),before_header)
                self.assertEqual([r.model_dump() for r in output],before_records)
                self.assertEqual(mock.await_count,1)
                self.assertNotIn("approval",result)
                self.assertNotIn("approved",result)
                prompt = mock.await_args.args[0]
                self.assertIn("Never recommend changing, adjusting, or re-scoring grades",prompt)
                self.assertIn("reviewed by a human",prompt)
                self.note(label,"inputs unchanged; no execution fields",{"inputs_unchanged":True,"returned_fields":sorted(result),"advisory_prompt_present":True})
            self.note("external scope","EXTERNAL / MANUAL REVIEW","Python does not execute advice. Returned malicious text is not filtered: human semantic review required; webapp approval/RBAC/lifecycle are EXTERNAL and unverified.")

    @case("ST-AI-007", "Truly zero attainment gaps", "Synthetic 12 records with exactly 70% direct and indirect, plus standalone no-gap prompt", "All 12 composite=70.00, met=True; gaps empty, prompt empty, no provider calls")
    async def test_st_ai007_zero_gap(self):
        await self.scenario("zero_gap",0)
        with SyntheticWorkbook(scenario="zero_gap") as fixture:
            extracted,output = await fixture.etl()
            self.assertTrue(all(a.composite_clo_attainment_pct==70.0 and a.met_threshold is True for a in output))
            gap = CQI.identify_gaps(extracted[0],CQI.anonymize_students(output))
            self.assertEqual(gap["gaps"],[])
            self.assertEqual(CQI.build_prompt(extracted[0],gap),"")
            self.note("independently established zero gaps",{"gaps":[],"prompt":""},{"gaps":gap["gaps"],"prompt":CQI.build_prompt(extracted[0],gap)})

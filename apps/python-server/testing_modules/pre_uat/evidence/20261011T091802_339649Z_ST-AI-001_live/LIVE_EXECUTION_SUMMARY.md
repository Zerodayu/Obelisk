# ST-AI-001 — Supplementary live Gemini execution

**Result: BLOCKED.** This is a genuine provider attempt, not a mock, placeholder or completed CQI generation.

Execution started at **2026-10-11T09:18:02.339649+00:00**. Duration: **7.768116 seconds**. Configured model: **gemini-3.5-flash-lite**; no generated-response model version was returned. Python 3.13.0; google-genai 2.25.0; Windows 11.

The unchanged production `generate_cqi_recommendation` and `call_llm_api` functions were invoked. Passive Python profiling observed the genuine SDK generation function and **one SDK HTTP attempt**. Gemini returned **HTTP 400, INVALID_ARGUMENT, API_KEY_INVALID**: “API key not valid. Please pass a valid API key.” This confirms provider access was attempted; it does not validate the configured credential or model availability.

No generated recommendation exists to display. Schema validation, response numerical grounding, advisory wording, responsible-role selection and educational usefulness therefore could not be evaluated. They are not marked PASS.

## Input and safety

The existing `SyntheticWorkbook(scenario="worst", students=4, clos=3)` helper and historical synthetic workbook builder were reused without changes. Only their named fixture/oracle definitions were loaded from source, so the Phase 2A network-denying bootstrap and provider mocks were never installed. The unchanged production extractor/transformer calculated the fixture before the recommender call.

Independent checks confirmed four fictional students, CLO1–CLO3 and twelve unique student-CLO records. Every record had direct 0%, indirect 20%, composite 6% (`0.70 × 0 + 0.30 × 20`), below the institutional 70% threshold. Per-CLO failure counts were four out of four. The production prompt used anonymized Student A–D labels and a synthetic instructor/course. Input records remained unchanged.

Preflight confirmed `IS_DEBUG_MODE=False`, one configured key, SDK main retry limit one, HTTPX transport and the direct Gemini API hostname. The SDK client was not replaced or configured differently. No retry, other AI test, integration test or performance test was run. No Redis/database/worker/webapp path was imported or started. Production files and historical tests were not modified. Provider logging was discarded because it includes key previews; evidence redacts configured keys and their previews.

## Institutional form wording

**Expected result:** Generate schema-valid advisory CQI recommendations with appropriate academic roles for the worst-case synthetic dataset: twelve student-CLO records at 6% composite attainment, all below 70%, without proposing grade manipulation.

**Actual result:** The production recommender attempted one real Gemini generation request, but Gemini rejected the configured key with HTTP 400 `API_KEY_INVALID`. No CQI recommendation was generated. Live ST-AI-001 is BLOCKED; output quality/schema checks remain unexecuted. Previous mocked ST-AI-001 PASS is preserved separately.

## Evidence

- [Original saved live result](ST-AI-001_result.txt): timestamp, environment, source invocation observations, synthetic input, actual prompt and sanitized production error envelope.
- [Actual prompt](PROMPT.txt).
- [Validation and unexecuted-check statuses](VALIDATION.json).
- [Source hashes](SOURCE_MANIFEST.json).
- [Successful zero-generation preflight](../20261011T091712_996265Z_ST-AI-001_live/ST-AI-001_result.txt).
- [Earlier deterministic mocked PASS](../20261011T063734_111127Z/ST-AI-001_result.txt).

Reproduction command from `apps/python-server` (do not rerun without approval for another live request):

```powershell
& '.venv/Scripts/python.exe' -B testing_modules/pre_uat/run_st_ai001_live.py --execute
```

Credential validity must be addressed by the maintainer without disclosing the key. A further live request needs separate authorization; no credential, global configuration or production recommendation logic was changed to work around the rejection.

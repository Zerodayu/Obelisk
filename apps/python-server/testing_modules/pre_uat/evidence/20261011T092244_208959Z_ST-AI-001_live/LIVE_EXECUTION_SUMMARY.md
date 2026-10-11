# ST-AI-001 — Successful live Gemini CQI generation

**PASS for live generation and automated contract/data checks. Academic quality and advisory acceptance require human review.** This is actual Gemini output, not a mocked or placeholder response.

| Item | Actual evidence |
| --- | --- |
| Test ID / type | ST-AI-001 / Live Gemini AI generation |
| Execution timestamp | 2026-10-11T09:22:44.208959+00:00 |
| Duration | 5.273162 seconds for the runner, including preflight and synthetic fixture processing; not an isolated model-latency benchmark |
| Requested and returned model version | gemini-3.5-flash-lite |
| Production function | `app.analytics.cqi_recommender.generate_cqi_recommendation` calling the unchanged `call_llm_api` |
| Genuine provider invocation | SDK `generate_content` observed; one SDK HTTP attempt; actual SDK response text/model captured |
| Input | Four fictional students × three CLOs = twelve unique records |
| Attainment | 0% direct, 20% indirect, 6% composite; all twelve below 70% |
| Provider response | Actual generated JSON with summary, two recommendations and pattern |
| Production schema validation | PASS; string response retained; Faculty and Program Chair roles valid |
| Saved input mutation | None |
| Additional calls during final review | Zero; review used this completed execution |

## Expected and actual result for the institutional form

**Expected:** Generate schema-valid advisory CQI recommendations for a worst-case synthetic dataset of twelve student-CLO records at 6% composite attainment, all below the institutional 70% threshold, with improvement actions and appropriate academic responsibilities.

**Actual:** The unchanged production recommender generated a genuine Gemini response assigning direct/indirect assessment review to Faculty and section-wide low-attainment review to the Program Chair. JSON schema passed; the response correctly stated four students, CLO1–CLO3, 0% direct, 20% indirect, 6% composite and the 70% threshold. Saved-input immutability passed. A subsequent review of the saved response recorded 48 passing data checks and zero mismatches. No grade-changing recommendation was observed on assistant inspection. Academic assessment of usefulness, sufficient improvement actions and advisory safety remains pending human review.

**Requirement assessment:** ST-AI-001's generation requirement is satisfied for this synthetic scenario. This does not establish correctness for every future Gemini response, academic reviewer sign-off, webapp integration or production readiness.

## Actual generated recommendation

```json
{
  "summary": "All 4 students in section BSIT-4A failed to meet the 70% composite attainment threshold across CLO1, CLO2, and CLO3, with an average composite attainment of 6.0% for each outcome.",
  "recommendations": [
    {
      "title": "Review Direct and Indirect Assessment Performance",
      "explanation": "Investigate why all students scored 0.0% on direct assessments and only 20.0% on indirect perceptions across CLO1, CLO2, and CLO3.",
      "recommendedFor": "Faculty"
    },
    {
      "title": "Evaluate Section-Wide Low Attainment",
      "explanation": "Assess the uniform low composite attainment of 6.0% across all students in section BSIT-4A for multiple CLOs to determine course delivery factors.",
      "recommendedFor": "Program Chair"
    }
  ],
  "pattern": "A uniform pattern exists across CLO1, CLO2, and CLO3 where all 4 students attained a composite score of 6.0%, driven by 0.0% direct scores and 20.0% indirect scores."
}
```

## Numerical grounding and review limits

The live runner's reused exact-sentence checker matched **zero** free-text claims and flagged four prose passages. Its empty mismatch list alone does not prove those statements correct. The original execution record is preserved with that limitation.

[Post-run review](POST_RUN_REVIEW.json) compares the actual saved response with independently validated ETL records: all eight percentage occurrences, both explicit student-count claims, each CLO mean, identities, mentions of CLO codes and section metadata, and independent 70/30 recomputation. It records 48 PASS and zero FAIL checks. Digits in identifiers such as CLO1 and BSIT-4A are treated as identifiers, not numerical attainment claims. The extraction is specific to this captured response; it is not a general validator for arbitrary model prose and was performed without another Gemini call.

The output describes the measured uniform gap and proposes investigation rather than asserting an unsupported cause. Assistant inspection found advisory verbs “Investigate” and “Assess”, with no suggestion to change, inflate or rescore grades. The schema verifies recipient role labels only; a qualified academic reviewer must judge whether these investigation actions are sufficiently useful and whether the assigned responsibilities/advisory wording are appropriate.

## Safety and execution path

The runner reused unchanged named fixture/oracle definitions from `support.py`, including `SyntheticWorkbook(scenario="worst", students=4, clos=3)` and the historical workbook builder. It did not import the Phase 2A bootstrap, invoke any mocked recommendation helper, replace Gemini, install a network blocker, change SDK options or alter production configuration. Production extractor/transformer processing was limited to a temporary synthetic workbook.

Preflight confirmed one configured key, `IS_DEBUG_MODE=False`, main SDK retry limit one, HTTPX transport, direct Gemini API hostname and disabled Vertex AI mode. The production function's single configured key prevents cross-key failover on this execution. Production automatic function calling is disabled. Passive profiling captured real SDK invocation/response without replacing provider logic. Application logs were discarded because they contain key previews; saved evidence redacts configured keys/previews.

No database, Redis, worker or webapp path was used. No academic record was written. No ST-AI-002–007, integration or performance test was executed. This run completed before the user's stop message was processed; final review resumed from its evidence rather than making a duplicate request.

## Evidence and history

- [Original successful execution record](ST-AI-001_result.txt), preserved unchanged.
- [Actual production prompt](PROMPT.txt).
- [Actual SDK-generated response](GEMINI_RESPONSE.json).
- [Supplemental grounding/advisory review](POST_RUN_REVIEW.json).
- [Execution source hashes](SOURCE_MANIFEST.json).
- [Earlier invalid-key live attempt](../20261011T091802_339649Z_ST-AI-001_live/LIVE_EXECUTION_SUMMARY.md), BLOCKED and preserved.
- [Original mocked ST-AI-001](../20261011T063734_111127Z/ST-AI-001_result.txt), PASS and preserved.

The earlier invalid-key call and this successful retry were separate user-authorized attempts. There was one SDK HTTP attempt in each execution, not one request across the complete history.

Command used from `apps/python-server`:

```powershell
& '.venv/Scripts/python.exe' -B testing_modules/pre_uat/run_st_ai001_live.py --execute
```

Do not rerun this command without approval for another billable live request. No further request is needed for this evidence review.

# OBELISK Institutional Pre-UAT AI Accuracy Report

**Project:** Outcomes-Based Educational Learning and Intelligent System Kit (OBELISK), Team 4th Dimension  
**Component:** Python ETL and CQI recommendation service  
**Submission:** October 13, 2026  
**Report prepared:** October 11, 2026, from saved evidence only

## Executive assessment

The saved evidence supports seven passing deterministic AI-system test IDs, two successful live Gemini CQI generations, and passing numerical validation of those two captured responses. These are separate evidence layers for the same test IDs, not ten distinct institutional tests. No test, provider request or service was executed for this report; production code and historical results were not changed.

The live worst-case and mixed-attainment responses passed the recorded recommendation-schema checks and described the supplied attainment gaps. Their 18 parsed quantitative claim occurrences matched independent synthetic expectations. Another 23 checks confirmed CLO/course/section identifiers. No supported numerical mismatch or unresolved numerical claim was recorded in the latest saved validation. This is agreement within two synthetic responses, not a general Gemini accuracy estimate or proof of educational effectiveness.

**Academic review is pending.** Neither schema validity nor numerical agreement establishes that the recommendations are sufficiently useful, pedagogically appropriate or institutionally approved. Python-side advisory behavior is verified within the recorded scope; webapp approval enforcement and the complete application are outside this assessment.

## Evidence layers and test outcomes

All deterministic timestamps below are UTC on **2026-10-11**. Full precision is retained in the linked original JSON result files. The deterministic suite used synthetic workbooks, independent attainment expectations and mocked provider paths; ST-AI-003/007 deliberately made no provider call.

| Test ID | Requirement | Saved deterministic outcome and time | Additional live evidence | Interpretation |
| --- | --- | --- | --- | --- |
| ST-AI-001 | Worst-case CQI generation | [PASS](evidence/20261011T063734_111127Z/ST-AI-001_result.txt), 06:37:50.637036 | [PASS](evidence/20261011T094047_256997Z_live_ai_evidence/ST-AI-001_result.txt); genuine generation 09:22:44.208959 | Twelve failed records; actual generated recommendations and schema verified. Academic usefulness pending. |
| ST-AI-002 | Mixed-attainment CQI generation | [PASS](evidence/20261011T063734_111127Z/ST-AI-002_result.txt), 06:37:50.741729 | [PASS](evidence/20261011T094047_256997Z_live_ai_evidence/ST-AI-002_result.txt); genuine generation 09:37:51.316190 | Six failed and six passing records; actual generated recommendations and schema verified. Academic usefulness pending. |
| ST-AI-003 | Ideal-attainment dataset | [PASS](evidence/20261011T063734_111127Z/ST-AI-003_result.txt), 06:37:50.844220 | No live generation | Composite 96.5%; zero gaps, `no_gaps_found`, null recommendation, zero provider calls. Verifies shortcut behavior, not generated recommendation quality. |
| ST-AI-004 | Numerical grounding against ETL data | [PASS](evidence/20261011T063734_111127Z/ST-AI-004_result.txt), 06:37:50.943553 | [PASS](evidence/20261011T094047_256997Z_live_ai_evidence/ST-AI-004_result.txt); saved-response validation 09:40:47.412745 | Original controlled mock claims and negative controls passed. Later validation checked both genuine responses without another Gemini call. |
| ST-AI-005 | AI unavailable/rate-limited | [PASS](evidence/20261011T063734_111127Z/ST-AI-005_result.txt), 06:37:51.043560 | No live outage/quota test | Mocked unavailable, 429 and timeout scenarios produced error status after two synthetic-key attempts; inputs unchanged. Actual quota behavior remains unverified. |
| ST-AI-006 | CQI remains advisory | [PASS](evidence/20261011T063734_111127Z/ST-AI-006_result.txt), 06:37:51.146554 | Live wording inspected; no separate live ST-AI-006 run | Python did not mutate inputs or execute advice. Malicious mocked text was returned unchanged: semantic filtering and webapp approval safety are not established by this PASS. |
| ST-AI-007 | Truly zero attainment gaps | [PASS](evidence/20261011T063734_111127Z/ST-AI-007_result.txt), 06:37:51.251051 | No live generation | Twelve records at exactly 70%, all meeting threshold; empty gaps/prompt, null recommendation and zero provider calls. |

The seven original PASS results remain historical deterministic evidence. Live additions do not replace them or retroactively change their execution type. The original ST-AI-004 statement that live numerical quality was unverified was accurate for that earlier run; subsequent saved live evidence supplies the additional verification.

## Genuine Gemini executions

Both successful generations invoked the existing production `generate_cqi_recommendation` → `call_llm_api` → Gemini SDK path, with no mocked provider or placeholder response. Saved provenance records one SDK HTTP attempt for each successful execution and requested/returned model **`gemini-3.5-flash-lite`**. Evidence records Python 3.13.0 and google-genai 2.25.0. Only fictional, anonymized academic data was supplied; the live runners did not use a database, Redis, workers or the webapp.

| Item | ST-AI-001: worst case | ST-AI-002: mixed attainment |
| --- | --- | --- |
| Unique students / CLOs / records | 4 / 3 / 12 | 4 / 3 / 12 |
| Independent attainment | Direct 0%, indirect 20%, composite 6% | Composite 40%, 62.5%, 73.5%, 90%, with each value present once per CLO |
| Threshold and gaps | 70%; all 12 records below threshold; 4 of 4 per CLO | 70%; 6 records below, 6 at/above; 2 of 4 per CLO |
| Relevant means | Composite mean 6% for each CLO | Below-threshold mean 51.25%; all-student mean 66.5% |
| Actual actions | Faculty: review direct/indirect assessment performance. Program Chair: evaluate section-wide low attainment. | Faculty: review direct assessment alignment. Program Chair: evaluate delivery and student support. |
| Response contract | Summary, two recommendation objects, pattern; schema PASS | Summary, two recommendation objects, pattern; schema PASS |
| Saved runner duration | 5.273162 seconds | 3.797552 seconds |
| Original provenance | [Original result](evidence/20261011T092244_208959Z_ST-AI-001_live/ST-AI-001_result.txt), [execution summary](evidence/20261011T092244_208959Z_ST-AI-001_live/LIVE_EXECUTION_SUMMARY.md) | [Raw live execution](evidence/20261011T093750_493757Z_live_ai_evidence/LIVE_ST-AI-002.json) |

These durations include runner/preflight/fixture work. They are not isolated provider latency measurements or completed performance benchmarks. The latest standardized files were produced by evidence-only processing in `20261011T094047_256997Z_live_ai_evidence`; `live_api_called=false` there means zero new requests during consolidation. Original generation timestamps are retained separately from processing timestamps.

An earlier [ST-AI-001 invalid-key attempt](evidence/20261011T091802_339649Z_ST-AI-001_live/LIVE_EXECUTION_SUMMARY.md) was BLOCKED with HTTP 400/API_KEY_INVALID and no generated response. It remains preserved; it is not a successful generation, a numerical error, or evidence that live rate-limit handling passed. Successful ST-AI-001 followed in a separate authorized execution.

## Numerical grounding accuracy

The recorded oracle compares production ETL outputs with independently calculated synthetic attainment, including the existing 70% direct + 30% indirect composite calculation. Captured Gemini prose is checked against those expected data. A failed student-CLO record is distinct from a unique student; six failed records in the mixed fixture must not be described as six unique students.

| Parsed claim category | Verified occurrences | Mismatches |
| --- | ---: | ---: |
| Unique student count | 2 | 0 |
| Institutional threshold | 3 | 0 |
| Composite attainment / scoped means | 5 | 0 |
| Direct attainment | 2 | 0 |
| Indirect attainment | 2 | 0 |
| Below-threshold numerator | 2 | 0 |
| Student denominator | 2 | 0 |
| **Quantitative subtotal** | **18** | **0** |
| CLO identifiers | 18 | 0 |
| Course/section identifiers | 5 | 0 |
| **All recorded claim occurrences** | **41** | **0** |

ST-AI-001 contributes 10 quantitative and 11 identifier checks; ST-AI-002 contributes 8 quantitative and 12 identifier checks. Repeated statements are separate occurrences, not independent samples. The responses did not explicitly claim a total of twelve records or a numerical CLO count; source-fixture checks must not be presented as additional model claims.

**Observed quantitative agreement: 18/18 supported occurrences across two responses.** Do not label this “100% AI accuracy.” The deterministic parser uses bounded prose rules, scope interpretation and tolerance of half a unit at the displayed percentage precision; counts must match exactly. The mixed response's 51.2% is accepted as a one-decimal representation of the 51.25% below-threshold mean, not the 66.5% whole-cohort mean. Academic reviewers should confirm that its population wording is sufficiently clear.

Each latest claim record includes response field, text/span, expected and actual values, outcome, method and scope explanation. Outcome categories are VERIFIED, MISMATCH, MANUAL REVIEW and NOT APPLICABLE. The latest captured responses have 41 VERIFIED, zero MISMATCH and zero unresolved numerical MANUAL REVIEW items. That numerical result does not remove semantic review obligations.

Historical checker limitations are retained. The initial ST-AI-001 exact-sentence checker matched zero prose claims, so its empty mismatch list was not proof of correctness. A [response-specific post-run review](evidence/20261011T092244_208959Z_ST-AI-001_live/POST_RUN_REVIEW.json) recorded 48 passing data checks, including fixture checks; these are not 48 model numerical claims. The [first combined live-evidence validation](evidence/20261011T093750_493757Z_live_ai_evidence/ST-AI-004_result.txt) retained nine manual items and marked ST-AI-004 BLOCKED. Subsequent parser improvements and negative controls produced a new evidence-only PASS record; neither response nor prior evidence was rewritten.

The original mocked ST-AI-004 checked three controlled sentences with twelve numeric fields, deliberately detected one wrong-count mismatch and flagged a 12% improvement forecast for manual review. Those negative controls validate the checker; they are not factual errors observed in the two actual Gemini responses. No broad accuracy, repeatability, hallucination-frequency or future-response guarantee can be inferred from this sample.

## Advisory safety and pending academic review

Recorded assistant inspection found no instruction in either live response to change, inflate or rescore grades. Both assigned assessment investigation to Faculty and delivery/support investigation to the Program Chair. This is a limited wording assessment, not documented academic approval or proof that prompt instructions always prevent unsafe advice.

ST-AI-006 establishes that Python preserves the input records and does not execute approvals or grade changes. Its malicious mocked response was schema-valid and returned unchanged. **Schema validation is not a semantic safety filter.** The webapp must enforce permissions, human review and approval lifecycle independently.

| Review item | Current state | Required reviewer / evidence |
| --- | --- | --- |
| Educational usefulness and specificity | PENDING | Faculty/Program Chair assessment of the full generated responses and relevant course context |
| Adequacy of improvement actions | PENDING | Academic judgment on whether investigation-only actions suffice and whether measurable follow-up is needed |
| Responsible roles | Valid schema labels; academic suitability PENDING | Faculty/Program Chair confirmation of ownership and responsibilities |
| Factual/causal interpretation | Numeric checks PASS; qualitative interpretation PENDING | Review inferred conceptual difficulty, delivery factors and support needs as hypotheses, not established causes |
| Advisory wording and grade integrity | No prohibited action observed in saved live wording; academic acceptance PENDING | Human review of recommendations before any action |
| Webapp approval/RBAC and display behavior | EXTERNAL / not established by these AI tests | Backend/frontend functional evidence, including failure handling and prevention of automated approval |
| Institutional acceptance and sign-off | NOT RECORDED | Required reviewer/consultant/instructor approvals under the institutional process |

No review score, reviewer identity, approval date or academic accuracy percentage is fabricated. No institutional-summary live generation, multilingual assessment, adversarial live test, real outage/quota experiment or longitudinal improvement outcome is covered here.

## Evidence index and submission use

Paths below are relative to this report. Use the linked deterministic files in the outcome table for all seven original test IDs; use the following live additions for generation and actual-output grounding.

| Evidence | Purpose |
| --- | --- |
| [Latest ST-AI-001 result](evidence/20261011T094047_256997Z_live_ai_evidence/ST-AI-001_result.txt) | Standardized worst-case live evidence with original generation timestamp |
| [ST-AI-001 prompt](evidence/20261011T094047_256997Z_live_ai_evidence/ST-AI-001_PROMPT.txt) / [actual response](evidence/20261011T094047_256997Z_live_ai_evidence/ST-AI-001_GEMINI_RESPONSE.json) | Submitted synthetic context and complete generated recommendation |
| [Latest ST-AI-002 result](evidence/20261011T094047_256997Z_live_ai_evidence/ST-AI-002_result.txt) | Standardized mixed-case live evidence with original generation timestamp |
| [ST-AI-002 prompt](evidence/20261011T094047_256997Z_live_ai_evidence/ST-AI-002_PROMPT.txt) / [actual response](evidence/20261011T094047_256997Z_live_ai_evidence/ST-AI-002_GEMINI_RESPONSE.json) | Submitted synthetic context and complete generated recommendation |
| [Latest ST-AI-004 result](evidence/20261011T094047_256997Z_live_ai_evidence/ST-AI-004_result.txt) | Claim-by-claim actual/expected numerical comparisons for both live outputs |
| [Results metadata](evidence/20261011T094047_256997Z_live_ai_evidence/RESULTS.json), [source manifest](evidence/20261011T094047_256997Z_live_ai_evidence/SOURCE_MANIFEST.json), [preservation record](evidence/20261011T094047_256997Z_live_ai_evidence/PRESERVATION.json) | Processing provenance, recorded source hashes and historical preservation |
| [Saved terminal summary](evidence/20261011T094047_256997Z_live_ai_evidence/TERMINAL_SUMMARY.txt) | Authentic saved execution summary; not a newly captured screenshot |
| [Deterministic test source](../ai_system_test/test_pre_uat_ai.py), [Phase 2A runner](run_phase2a.py) | Original assertions and isolated mocked execution path |
| [Live evidence runner](run_live_ai_evidence.py), [claim checker](live_ai_claims.py), [workflow instructions](LIVE_AI_EVIDENCE_README.md) | Reproducibility and documented parser limitations; not executed for this report |

For the institutional AI/system-testing rows, attach both the original deterministic evidence and the applicable live additions. ST-AI-001/002 demonstrate actual generation; ST-AI-004 demonstrates observed output grounding. ST-AI-003/005/006/007 remain deterministic service-behavior evidence within their stated limits. Record academic review as pending, rather than combining it with automated PASS.

Python evidence does not satisfy frontend/backend persistence, authorization, approval, export or complete end-user workflow requirements. Those need teammates' evidence. Performance acceptance and reviewer sign-offs also require separate records. IoT requirements do not apply to this Python compute component and should be mapped by the institutional submission owner.

**Readiness statement:** The recorded Python AI checks passed within their specified scope, including two genuine Gemini generation scenarios and supported numerical claims in those outputs. Academic acceptance remains pending. This report does not establish whole-webapp Pre-UAT completion, production readiness or institutional sign-off.

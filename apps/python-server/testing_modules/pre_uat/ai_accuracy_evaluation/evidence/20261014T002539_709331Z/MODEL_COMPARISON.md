# Gemini 3.6 Flash evaluation compared with historical Flash-Lite

Evaluation: 2026-10-14, 00:25:39 UTC (08:25:39 Asia/Shanghai).
Status: **BLOCKED by provider availability**, following two real generation attempts. No mocked or replayed predictions were scored.

The authenticated Gemini Developer API model catalog listed `models/gemini-3.6-flash` with `generateContent` support. Effective production configuration and both SDK requests used `gemini-3.6-flash`. Neither request returned a generated response: both returned HTTP 503 `UNAVAILABLE`, stating that the model was experiencing high demand. Consequently, no provider-returned model version, response ID or successful model output can be verified for this execution. One catalog request and two generation attempts were made, with no retries. The existing evaluator exited unsuccessfully.

## Comparability

The unchanged original `evaluate.py --live` reused `dataset.py`, `matrices.py`, the known synthetic mixed workbook, and the original prompts. Both prompt files and both ground-truth CSVs are byte-identical to the successful October 11 evidence. ETL independently matched all 150 student-CLO records with zero mismatches. No classification ground-truth labels were supplied as model predictions.

Direct attainment is summed raw scores divided by summed maxima; indirect attainment is rating/5. The 70/30 composite is rounded to two decimals with half-even rounding. Positive means composite strictly below 70%; exactly 70 passes. There are 40 positives and 110 negatives. Whole-CLO classification retains the provisional mean-composite rule; its five all-negative cases cannot establish recall.

## Classification comparison

Historical execution: October 11, 2026, `20261011T120423_240293Z`, requested and provider-returned model `gemini-3.5-flash-lite`. Saved provider response IDs, usage metadata, raw responses and one request per generation corroborate actual Gemini responses, distinct from mocked institutional tests.

| Measure | Historical Flash-Lite | New Flash |
| --- | ---: | --- |
| Scored cases | 150/150 | 0/150; 150 missing |
| Accuracy | 85.33% | Not assessed |
| Precision | 76.47% | Not assessed |
| At-risk recall | 65.00% | Not assessed |
| F1-score | 70.27% | Not assessed |
| TP | 26 | Not assessed |
| FN | 14 | Not assessed |
| FP | 8 | Not assessed |
| TN | 102 | Not assessed |

Historical confusion matrix (rows actual; columns predicted):

| Actual / predicted | At risk | Not at risk |
| --- | ---: | ---: |
| At risk | 26 | 14 |
| Not at risk | 8 | 102 |

The new confusion matrix is **not assessed**, rather than an all-zero matrix or counting unavailable responses as false negatives. Recall and F1 improvement cannot be determined.

## CQI factual grounding, assessed separately

Historical CQI checking recorded 10 VERIFIED claims, four MANUAL REVIEW claims and no recorded factual mismatches. Its human academic review remains pending; this is not a recommendation-quality percentage. The new CQI request produced no recommendation, so factual grounding and the separate academic rubric are not assessable. Blank review fields remain blank.

## Preservation and limits

All 555 original files checked before the availability lookup remain unchanged, including existing Pre-UAT evidence, evaluator scripts, production code/configuration, documentation and the synthetic workbook. Only this new dated evidence directory was added. No production student data, application database, Redis, upload endpoint, live application service or container was used. Owned clients and the asyncio loop were closed.

The HTTP 503 responses establish a provider-availability blocker, not model accuracy failure, invalid model ID, or a production parser failure. A later bounded real evaluation is needed when provider availability recovers; this run made no retries or substitute-model calls. The older standalone README retains its earlier blocked-run narrative and is historical context, not the latest outcome; it was preserved as requested. The institutional AI report describes a separate smaller-fixture evaluation and its claims must not be conflated with this 150-case comparison.

Evidence: `provider_model_availability.json`, `cqi_generation.json`, `classification_generation.json`, `classification_metrics.json`, `workflow_and_isolation.json`, `historical_comparison.json`, and `original_preservation_verification.json`. Original failure reports and null metrics remain intact.

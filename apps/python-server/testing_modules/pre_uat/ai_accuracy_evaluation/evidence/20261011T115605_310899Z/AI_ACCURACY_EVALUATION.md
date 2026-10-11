# OBELISK standalone AI accuracy evaluation

Execution timestamp: 2026-10-11T11:56:05.321282+00:00. Dataset: `classrecord_templates/JMCFI_Class_Record_Template_AUN-OBE(mixed).xlsx`. SHA-256: `867873f6fd2dd016e39ffc8a7371dc5e5eff618e74c894eb90865690cb1c8e73`.

OBELISK AI ACCURACY EVALUATION - NEW BOUNDED EVALUATION
Execution: 2026-10-11T11:56:05.321282+00:00
Dataset SHA-256: 867873f6fd2dd016e39ffc8a7371dc5e5eff618e74c894eb90865690cb1c8e73
Positive = AT RISK. Ground truth calculated independently; model labels used as predictions.
STUDENT-CLO: INCOMPLETE; scored 0/150; missing 150
  Confusion matrix and accuracy/precision/recall/F1 NOT ASSESSED: no actual predictions.
  Dataset positives=40; scored positives=0; errors=0
CLO (PROVISIONAL): INCOMPLETE; scored 0/5; missing 5
  Confusion matrix and accuracy/precision/recall/F1 NOT ASSESSED: no actual predictions.
  Dataset positives=0; scored positives=0; errors=0
CQI: INCOMPLETE; academic quality: PENDING; no quality percentage assigned.
Current Gemini SDK attempts: 0 (maximum 2; no retry)
Protected originals unchanged: True; isolated compute, no HTTP/Redis/Docker.
Evidence: testing_modules/pre_uat/ai_accuracy_evaluation/evidence/20261011T115605_310899Z
Historical source SDK attempts: 2; errors preserved, not new requests.
CQI INCOMPLETE: [LLM API ERROR: All 1 configured API key(s) were exhausted without success. Details: Key #1 ([REDACTED]) failed: DNS lookup outside the Gemini endpoint prohibited]
CLASSIFICATION INCOMPLETE: DNS lookup outside the Gemini endpoint prohibited


## Evidence and interpretation

Student classifications use independently recomputed 70/30 composite attainment, rounded to two decimals,
against 70%; exactly 70 passes. Whole-CLO classification uses the explicitly provisional mean-composite
below-70% rule. This workbook has no positive whole-CLO cases; five cases cannot establish intervention
detection recall. Null precision/recall/F1 mean the formula denominator is zero, not perfect performance.
Incomplete prediction coverage never counts missing cases as correct; metrics then describe scored cases only.
Both confusion matrices use rows=actual, columns=predicted, with at-risk first.

Ground truth derives from RECORD raw assessments and F12 survey ratings, independently checking
Direct/Indirect formula caches. Production ETL results were cross-checked where execution reached that stage.
CLO4/5 have only Final assessments, despite non-null zero subtotals for earlier periods; this coverage limitation
must not be hidden by the current non-null completeness check.

The existing worker's production ETL pipeline and CQI function are reused directly in-process.
The old E2E script is a workflow reference and was neither changed nor executed. HTTP upload, polling,
authentication, Redis queues and application lifecycle are not exercised. No services or containers were created.
Production prompt/schema remain unchanged. The separate classification prompt supplies raw scores, maxima,
ratings, case IDs and rules without ground-truth risk labels. Actual raw SDK text is preserved before parsing;
model/version, request attempts, errors and elapsed times are recorded in generation JSON files when available.

## Recommendation quality

Status: INCOMPLETE. See recommendation_quality_report.json for schema checks and individual factual claims.
The deterministic factual parser supports bounded explicit grammars. Unrecognized numerical wording and
causal assertions remain manual review. No recommendation-quality percentage is assigned.
human_review_rubric.csv defines five 0-2 criteria with blank judgments; a qualified reviewer must score it.

## Actual execution blockers

{
  "cqi": {
    "status": "INCOMPLETE",
    "error": "[LLM API ERROR: All 1 configured API key(s) were exhausted without success. Details: Key #1 ([REDACTED]) failed: DNS lookup outside the Gemini endpoint prohibited]",
    "source_evidence": "testing_modules/pre_uat/ai_accuracy_evaluation/evidence/20261011T115002_695327Z/cqi_generation.json",
    "generation_timestamp": "2026-10-11T11:50:08.339109+00:00"
  },
  "classification": {
    "status": "INCOMPLETE",
    "error": "DNS lookup outside the Gemini endpoint prohibited",
    "source_evidence": "testing_modules/pre_uat/ai_accuracy_evaluation/evidence/20261011T115002_695327Z/classification_generation.json",
    "generation_timestamp": "2026-10-11T11:50:09.921178+00:00"
  }
}

The source SDK attempts were blocked during DNS resolution before a Gemini response was obtained.
They do not establish a provider-side rejection, model classification error or successful generation.
The installed AnyIO resolver passes ASCII hostnames as bytes; the original guard used str(bytes),
which did not match the allowed plain domain. String/byte canonicalization was checked offline,
with connections restricted to public addresses resolved for the exact Gemini host. No additional
live attempt was made in the consolidation; runtime verification needs fresh authorization.
The earlier Windows asyncio wakeup-pair failure remains preserved separately.

## Separate historical evidence layers

Existing seven ST-AI test definitions/results remain unchanged and are not this classification evaluation.
Prior live Gemini factual-consistency evidence used four students and three CLOs, not this 30-student workbook:
`testing_modules/pre_uat/evidence/20261011T094047_256997Z_live_ai_evidence/`.
The historical report `testing_modules/pre_uat/AI_ACCURACY_REPORT.md` describes those saved layers.
Neither historical PASS nor schema validity is treated as classification accuracy here.

## Reproduction and limitations

Replay saved actual responses with `python -B testing_modules/pre_uat/ai_accuracy_evaluation/evaluate.py --responses testing_modules/pre_uat/ai_accuracy_evaluation/evidence/20261011T115605_310899Z`.
Replay writes a fresh directory and makes no model requests. A new `--live` execution requires fresh user
authorization: model output can vary, even at temperature zero. Raw responses and source hashes enable
reproducible scoring of this captured execution, not guaranteed repeat generation or population-level accuracy.
Use classification_metrics.json, prediction CSVs and classification_errors to inspect genuine disagreements.
source_manifest.json confirms preservation of production/workbook/historical evidence/dashboard inputs.
workflow_and_isolation.json records runtime checks, cleanup and limitations. Any failed request remains incomplete.

# AI accuracy evaluation guide

This guide covers the separate 150 student-CLO benchmark in `testing_modules/pre_uat/ai_accuracy_evaluation/`. For legacy mocked tests or institutional ST-AI evidence validation, use the [testing guide](TESTING.md). Commands run from `apps/python-server/` using the existing project environment.

## Choose replay or a new real evaluation

To rescore the original successful responses without calling Gemini:

```powershell
python -B testing_modules/pre_uat/ai_accuracy_evaluation/evaluate.py --responses testing_modules/pre_uat/ai_accuracy_evaluation/evidence/20261011T120423_240293Z
```

Or use uv without synchronizing dependencies:

```powershell
uv run --no-sync python -B testing_modules/pre_uat/ai_accuracy_evaluation/evaluate.py --responses testing_modules/pre_uat/ai_accuracy_evaluation/evidence/20261011T120423_240293Z
```

Replay evaluates the saved **actual provider outputs**. It makes zero new API calls and does not represent a new execution of the configured model. Replaying a failed directory leaves missing-response metrics unassessed.

To make a new real-model evaluation after checking the model and obtaining authorization for API usage:

```powershell
python -B testing_modules/pre_uat/ai_accuracy_evaluation/evaluate.py --live
```

Or:

```powershell
uv run --no-sync python -B testing_modules/pre_uat/ai_accuracy_evaluation/evaluate.py --live
```

For `python`, activate `.\.venv\Scripts\Activate.ps1` first. The live mode makes at most two generation attempts without retries: production CQI, then separate classification. API charges may apply. HTTP upload, Redis jobs, application database persistence, deployed services and Docker are not part of this evaluation. Do not start them for this test.

## Confirm the effective model before calling it

The current source default in `app/core/config.py` is `gemini-3.5-flash-lite`. `OBELISK_LLM_MODEL` in root/runtime configuration can override it, so a live evaluation uses the effective setting rather than a model fixed by this guide. `app/core/env.py` loads the selected encrypted repo-root `.env.local` or `.env.prod`; pre-set process values take precedence. Do not add a per-package `.env`. `OBELISK_DEBUG` controls logging, not mock mode; production `IS_DEBUG_MODE=False` selects real Gemini.

The unchanged evaluator requires exactly one configured valid key to bound failover, real mode, direct Gemini Developer API transport, one SDK attempt per generation and no custom proxy/endpoint configuration. It checks safety prerequisites but **does not query the available model catalog itself**. Verify the catalog separately before a new live run; do not infer availability from the source default or historical results.

This read-only preflight prints the effective model and its catalog entry without printing credentials. It queries the provider, but does not generate content or change configuration:

```powershell
$modelCheck = @'
import contextlib, io, json, logging
logging.disable(logging.CRITICAL + 1)
try:
    with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
        from app.core.config import settings
    from google import genai
    from google.genai import types
    keys = settings.llm_api_keys_list
    if len(keys) != 1:
        raise RuntimeError("The bounded evaluator requires exactly one configured key")
    with genai.Client(api_key=keys[0], http_options=types.HttpOptions(
        timeout=20000, retry_options=types.HttpRetryOptions(attempts=1)
    )) as client:
        matches = [{"name": m.name, "supported_actions": m.supported_actions}
                   for m in client.models.list(config={"page_size": 1000})
                   if m.name == "models/" + settings.LLM_MODEL]
    print(json.dumps({"effective_model": settings.LLM_MODEL, "catalog_matches": matches}, indent=2))
    if not matches or "generateContent" not in (matches[0]["supported_actions"] or []):
        raise SystemExit("Configured model is unavailable for generation; do not run --live")
except Exception as exc:
    print("Preflight blocked:", type(exc).__name__, "HTTP code:", getattr(exc, "code", None))
    raise SystemExit(1)
'@
python -B -c $modelCheck
```

Use `uv run --no-sync python -B -c $modelCheck` instead of the final line if using uv. If the printed model differs from the intended model, stop and review the existing root/runtime override. A different model requires a separately authorized configuration change; this guide does not change it. Catalog availability does not guarantee that generation will succeed at that moment.

After a successful evaluation, check `requested_model` and **`returned_model_version`** in both `classification_generation.json` and `cqi_generation.json`. Response IDs, usage metadata and captured raw responses establish successful provider provenance. A requested model alone does not establish a successful runtime model response.

## Methodology and fixtures

The original [dataset helper](../testing_modules/pre_uat/ai_accuracy_evaluation/dataset.py), [evaluator](../testing_modules/pre_uat/ai_accuracy_evaluation/evaluate.py) and [matrix renderer](../testing_modules/pre_uat/ai_accuracy_evaluation/matrices.py) remain unchanged. Preserve the original prompts, definitions and thresholds when comparing runs.

Synthetic workbook, relative to the service root:

```text
classrecord_templates/JMCFI_Class_Record_Template_AUN-OBE(mixed).xlsx
```

The evaluator checks its known SHA-256 to prevent using an unintended workbook. It contains 30 fictional students and five CLOs: **150 student-CLO cases, 40 at risk and 110 not at risk**. No production student data is needed.

Ground truth independently sums RECORD assessments and verifies F12 survey ratings against workbook caches. Direct attainment is summed scores divided by summed maxima; indirect attainment is rating/5. Composite attainment uses 70% direct and 30% indirect, rounded to two decimals with half-even rounding. Positive means rounded composite **strictly below 70%**; exactly 70% passes. Zero maxima in a period mean no assessment that period; CLO4/5 have Final assessments only. Canonical domain definitions remain in [FORMULAS.md](FORMULAS.md).

The classification prompt supplies raw data and calculation rules, without ground-truth labels, and requests exactly 150 student-CLO labels plus five whole-CLO labels. Whole-CLO risk provisionally means mean rounded composite below 70%. The five whole-CLO cases are all negative; 100% accuracy on them cannot establish at-risk detection recall.

For positive = at risk, accuracy is `(TP + TN) / evaluated cases`, precision is `TP / (TP + FP)`, recall is `TP / (TP + FN)` and F1 is `2 * precision * recall / (precision + recall)`. Zero denominators are undefined. Missing or invalid model labels are reported explicitly; independently computed labels never substitute for absent predictions.

CQI is evaluated separately for JSON contract and supported factual claims. The bounded claim checker cannot certify arbitrary prose or causal/pedagogical assertions. The blank five-criterion academic rubric requires a qualified reviewer; no human quality score is inferred from classification accuracy or schema validity.

## Where results are saved

Every live or replay invocation creates a new UTC-dated directory under [accuracy evidence](../testing_modules/pre_uat/ai_accuracy_evaluation/evidence/). It does not overwrite earlier evidence or institutional consolidated results.

| Artifact | Read it for |
| --- | --- |
| `execution_summary.txt` | Coverage, confusion counts, percentages and execution errors |
| `classification_metrics.json` | TP/TN/FP/FN, accuracy/precision/recall/F1, missing labels and generation metadata |
| `classification_generation.json`, `cqi_generation.json` | Requested/returned model, SDK attempts, raw output or sanitized failure |
| `classification_prompt.txt`, `cqi_prompt.txt` | Exact prompts sent for this execution |
| `ground_truth_student_clo.csv`, `ground_truth_clo.csv` | Independent labels and numerical basis |
| `recommendation_quality_report.json`, `human_review_rubric.csv` | Automated factual checks and pending academic review |
| `workflow_and_isolation.json`, `source_manifest.json` | ETL cross-check, request bounds, cleanup and preservation |
| Prediction CSVs and confusion-matrix PNGs | Produced when actual predictions exist; never manufactured for absent responses |

Do not treat HTTP 503, an invalid key or a safety prerequisite failure as a model misclassification. Read the captured error, retain null/unassessed metrics, and preserve that run. Any later retry creates another dated run and requires authorization for further API usage.

## Saved runs reviewed — October 14, 2026

These are saved results, not tests executed during documentation consolidation:

| UTC evidence directory | Actual provenance and outcome |
| --- | --- |
| [20261011T120423_240293Z](../testing_modules/pre_uat/ai_accuracy_evaluation/evidence/20261011T120423_240293Z/execution_summary.txt) | Actual `gemini-3.5-flash-lite`; 150/150 scored; TP 26, FN 14, FP 8, TN 102; accuracy 85.33%, precision 76.47%, recall 65.00%, F1 70.27%. CQI: 10 verified, four manual-review claims; academic review pending. |
| [20261014T002539_709331Z](../testing_modules/pre_uat/ai_accuracy_evaluation/evidence/20261014T002539_709331Z/MODEL_COMPARISON.md) | Catalog-confirmed `gemini-3.6-flash` requested; both real generation attempts returned HTTP 503. No captured model output; classification and CQI grounding not assessed. |
| [20261014T003214_597255Z](../testing_modules/pre_uat/ai_accuracy_evaluation/evidence/20261014T003214_597255Z/execution_summary.txt) | Requested **and returned** `gemini-3.5-flash-lite`; 150/150 scored; TP 26, FN 14, FP 7, TN 103; accuracy 86.00%, precision 78.79%, recall 65.00%, F1 71.23%. CQI: nine verified, five manual-review claims; academic review pending. **This is not a Gemini 3.6 Flash result.** |

The source default and a later runtime override can differ. The reviewed evidence contains no successful Gemini 3.6 Flash evaluation, so it cannot establish whether that model improves recall or F1. Earlier startup/DNS-blocked runs remain preserved in the same evidence folder and the [original directory README](../testing_modules/pre_uat/ai_accuracy_evaluation/README.md).

The [institutional AI accuracy report](../testing_modules/pre_uat/AI_ACCURACY_REPORT.md) concerns smaller ST-AI fixtures and two CQI responses. Its 18 quantitative claim checks are not the 150 classification cases and must not be used as a classification-accuracy score.

# AI System Test — CQI Institutional Report Narrative

This directory houses the system test suite, grounding documentation, and non-circular replay verification for the CQI Report Narrative endpoint (`POST /analytics/cqi-narrative`), specifically validating Part 7 (CQI Recommendations) and the Advisory Narrative Scope of the **OBELISK — CQI Institutional Report Development Brief**.

## Report Scope Notice: Strengths and Priorities
> [!IMPORTANT]
> - **Identified Strengths**: **NOT PRESENT** in this endpoint's output. The webapp computes attainment strengths from database statistics and section aggregations.
> - **Dedicated Next-Cycle Priorities List**: **NOT PRESENT** as a separate list. The narrative returns advisory `recommendations` and `possible_contributing_factors` hypotheses; the webapp aggregates these recommendations into its institutional priorities section.
> - **Part 9 Claims**: Previous claims of "Part 9 verified" have been removed across all audit reports to accurately reflect that only the narrative summary, advisory recommendations, root-cause hypotheses, and data limitations are generated here.

## Gemini Structured Output Enforced by SDK
The live endpoint uses Google GenAI SDK's `types.GenerateContentConfig` with `response_mime_type="application/json"` and `response_schema=CQINarrativeOutput`:
1. **OpenAPI Enums Enforced at Generation Time**:
   - `responsible_role`: Strictly restricted by the SDK schema to `["Faculty", "Program Chair", "Dean", "VPAA", "AQAU"]`.
   - `root_cause_category`: Strictly restricted by the SDK schema to the 6 canonical categories matching `apps/backend/lib/validators/root-cause.ts`.
2. **Nullable Timeline**:
   - `timeline`: Marked `nullable: true` in the schema. When no timeline fact is supplied, the model returns `null` or `"To be set by Program Chair"`.
3. **Pydantic Hard Validator as Second Gate**:
   - Even though the SDK physically constrains generation token choices to the schema, Python's hard validator (`validate_cqi_narrative`) executes as an independent second gate verifying citations, number traceability, and absence of invented durations/dates.

## Provenance of Outputs

- **`live_*` outputs (`live_baseline_output.json`, `live_gemini_output.json`, `live_output_all_met.json`, `live_output_missing_data.json`, `live_output_two_not_met.json`, `live_output_escalated_entry.json`, `live_output_prompt_injection.json`)**: Real SDK responses from Google Gemini (`gemini-3.5-flash-lite`) generated under authorized live execution (`IS_DEBUG_MODE = False`). All metadata (`returned_model_version`, `response_id`, `usage_metadata`, `timestamp_utc`, `attempts_used`) were retrieved directly from the Google GenAI SDK `response` object.
- **`synthetic_*` outputs (`synthetic_output_*.json`)**: Offline mock outputs generated via internal mock mode (`IS_DEBUG_MODE = True`). They are explicitly prefixed `synthetic_` and marked `execution_mode: "mock"`.

## Re-Run Ledger: Targeted Live Runs with Structured Output

| Payload | Output File | Status | Calls Used | Attempts | Model Version | Response ID | First-Attempt Result / Reason |
|---|---|---|---|---|---|---|---|
| **Baseline (Standard CQI)** | `live_baseline_output.json` | `ok` | 1 | 1 | `gemini-3.5-flash-lite` | `0_Pyaqv6GMHd9tMPnPqwwAI` | **Clean Pass (Attempt 1)**. Validated 2 recommendations, timeline `"Within 4 weeks"` on CLO1 and `"To be set by Program Chair"` on PLO1. |
| **Missing Data & Completeness** | `live_output_missing_data.json` | `ok` | 1 | 1 | `gemini-3.5-flash-lite` | `1vPyavqPItHgrfcP9qXfAQ` | **Clean Pass (Attempt 1)**. Enums enforced: `role: "Program Chair"`, `category: "3-Assessment Design"`, `timeline: "To be set by Program Chair"`. |

## Running the System Test

### 1. Offline Non-Circular Replay (Default)
Validates the recorded live output, verifies dynamic number traceability, runs all 6 negative tests, and replays all synthetic and live test cases:
```bash
.venv/bin/python -B testing_modules/cqi_narrative_system_test/test_cqi_narrative_system.py
```

### 2. Live Targeted Execution
Re-runs the baseline and missing-data live tests against Google Gemini (`gemini-3.5-flash-lite`):
```bash
.venv/bin/python -B testing_modules/cqi_narrative_system_test/run_live_targeted.py
```

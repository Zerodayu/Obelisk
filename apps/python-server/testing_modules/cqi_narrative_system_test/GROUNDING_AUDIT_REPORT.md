# CQI Narrative AI System Test & Grounding Audit Report

## 1. Executive Summary & Deliverable Scope

This report provides the full verification, grounding audit, and provenance documentation for `POST /analytics/cqi-narrative` (Endpoint 3).

### Report Scope Statement: Strengths & Next-Cycle Priorities
- **Identified Strengths**: **NOT PRESENT** in this endpoint's output. The webapp computes attainment strengths from database statistics and cohort section aggregations.
- **Dedicated Next-Cycle Priorities List**: **NOT PRESENT** as a standalone section. The endpoint outputs advisory `recommendations` and `possible_contributing_factors` hypotheses; the webapp aggregates these recommendations into its institutional priorities section.
- **"Part 9 Verified" Claim Removed**: All prior claims claiming full verification of Part 9 of the brief have been removed. The endpoint only generates the narrative summary, advisory recommendations with existing action assessments, root-cause hypotheses, and data limitation disclosures.

---

## 2. Root-Cause Categories Verbatim Comparison

Comparison between `apps/backend/lib/validators/root-cause.ts` and `apps/python-server/app/analytics/cqi_constants.py`:

| Index | Backend Validator (`apps/backend/lib/validators/root-cause.ts`) | Python Definition (`app/analytics/cqi_constants.py`) | Status |
|---|---|---|---|
| 1 | `"1-Curriculum Design"` | `"1-Curriculum Design"` | **EXACT MATCH** |
| 2 | `"2-Instruction & Pedagogy"` | `"2-Instruction & Pedagogy"` | **EXACT MATCH** |
| 3 | `"3-Assessment Design"` | `"3-Assessment Design"` | **EXACT MATCH** |
| 4 | `"4-Student Factors"` | `"4-Student Factors"` | **EXACT MATCH** |
| 5 | `"5-Resources & Tools"` | `"5-Resources & Tools"` | **EXACT MATCH** |
| 6 | `"6-Industry & Field Alignment"` | `"6-Industry & Field Alignment"` | **EXACT MATCH** |

> [!NOTE]
> The backend validator code in `apps/backend/lib/validators/root-cause.ts` uses `"6-Industry & Field Alignment"`. Although webapp documentation notes previously referred to the sixth category as "Institutional Support & Administrative Policies", the authoritative validator implementation enforces `"6-Industry & Field Alignment"`. Python matches the backend code 1:1, pinned by unit test `test_root_cause_categories_match_backend_verbatim`.

---

## 3. Gemini SDK Structured Output Enforcement

The live execution call enforces structured JSON schema via the Google GenAI SDK:
```python
config = types.GenerateContentConfig(
    response_mime_type="application/json",
    response_schema=CQINarrativeOutput,
    automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
)
```

### How the SDK Enforces Schema at Generation Time
1. **OpenAPI Schema Generation**: The Google GenAI SDK converts `CQINarrativeOutput` into an OpenAPI schema via `google.genai._transformers.t_schema`.
2. **Constrained Decoding Enums**:
   - `responsible_role` is sent with `enum: ['Faculty', 'Program Chair', 'Dean', 'VPAA', 'AQAU']`.
   - `root_cause_category` is sent with `enum: ['1-Curriculum Design', '2-Instruction & Pedagogy', '3-Assessment Design', '4-Student Factors', '5-Resources & Tools', '6-Industry & Field Alignment']`.
   - During generation, the Gemini model's token probabilities are strictly masked to tokens that follow this JSON grammar.
3. **Nullable Timeline**: `timeline` is typed as `Optional[str] = None` (`nullable: true`). When no timeline fact is supplied, the model emits `null` or `"To be set by Program Chair"`.
4. **Second Gate Validator**: Python's `validate_cqi_narrative()` executes independently after parsing, verifying that:
   - All cited fact IDs exist in `<FACTS>`.
   - Every number matches a canonical fact number.
   - If no timeline fact was supplied, any invented durations or dates are hard-rejected.

---

## 4. Re-Run Ledger: Targeted Live Runs with Structured Output

Re-run authorized for `synthetic_payload.json` and `payload_missing_data.json` (2 calls made, 0 retries needed):

| Scenario | Payload File | Output File | Status | Calls Used | Attempts | Model Version | Response ID | Usage (Prompt / Cand / Total) | UTC Timestamp |
|---|---|---|---|---|---|---|---|---|---|
| **Baseline (Standard CQI)** | `synthetic_payload.json` | `live_baseline_output.json` | `ok` | 1 | 1 | `gemini-3.5-flash-lite` | `0_Pyaqv6GMHd9tMPnPqwwAI` | 3,673 / 938 / 4,611 | `2026-11-10T10:37:10Z` |
| **Missing Data & Completeness** | `payload_missing_data.json` | `live_output_missing_data.json` | `ok` | 1 | 1 | `gemini-3.5-flash-lite` | `1vPyavqPItHgrfcP9qXfAQ` | 2,752 / 327 / 3,079 | `2026-11-10T10:37:12Z` |

- **First-Attempt Pass Rate**: 2 / 2 (100%).
- **Retries Needed**: 0.
- **Failures / Refusals**: 0.
- **Enforced Values**:
  - In `live_output_missing_data.json`, `timeline` is `"To be set by Program Chair"`, `role` is `"Program Chair"`, and `root_cause_category` is `"3-Assessment Design"`.

---

## 5. Dynamic Number Traceability Audit (Script-Generated)

Traceability audit for `live_baseline_output.json`:

| Numeric Token | Audit Status | Matched Canonical Fact / Source |
|---|---|---|
| `2025` | **TRACED** | `fact_meta_term_label` (value: `AY 2025-2026, 2nd Semester`) |
| `2026` | **TRACED** | `fact_meta_term_label` (value: `AY 2025-2026, 2nd Semester`) |
| `69.4` | **TRACED** | `fact_clo_CLO1_composite` (value: `69.4`) |
| `75.0` | **TRACED** | `fact_clo_CLO1_target` (value: `75.0%`) |
| `4` | **TRACED** | `fact_cqi_CLO1_1_timeline` (value: `Within 4 weeks`) |
| `74.93` | **TRACED** | `fact_plo_PLO1_composite` (value: `74.93`) |

- **Invented Numbers**: **0 (Zero)**.
- **Traceability Summary**: **6/6 (100%) numbers verified**.

---

## 6. Non-Circular Replay & Negative Test Results

Automated execution via `test_cqi_narrative_system.py` confirmed:
1. **Provenance Match**: Requested model matches `gemini-3.5-flash-lite`, returned version is `gemini-3.5-flash-lite`, execution mode is `live`, and `is_debug_mode` is `False`.
2. **Negative Test 1 (Invented Number Injection)**: Injecting `99.9%` was rejected (`Number '99.9' does not match any supplied fact number`).
3. **Negative Test 2 (Unknown Fact Citation)**: Injecting `fact_unknown_9999` was rejected (`cites unknown fact_id: 'fact_unknown_9999'`).
4. **Negative Test 5 (Unsupplied Duration Number)**: Recommending `"Within 8 weeks"` when facts only supplied 4 was rejected (`Number '8' does not match any supplied fact number`).
5. **Negative Test 6 (Coverage Bypass Attempt)**: Attempting to address a NOT MET outcome solely via `data_limitations` without recommendations or contributing factors was rejected.

All negative tests and all synthetic + live replays passed.

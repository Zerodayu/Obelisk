# AI System Test — CQI Institutional Report Narrative

This directory houses the system test suite and grounding documentation for the CQI Report Narrative endpoint (`POST /analytics/cqi-narrative`), specifically validating Part 7 (CQI Recommendations) and Part 9 (Conclusion & Next-Cycle Priorities) of the **OBELISK — CQI Institutional Report Development Brief**.

## Contents

- **[`synthetic_payload.json`](./synthetic_payload.json)**: Realistic synthetic institutional assessment payload (BSCS, AY 2025-2026, 2nd Sem) representing course and program outcomes, completeness, prior-cycle values, and loop closing status.
- **[`live_gemini_output.json`](./live_gemini_output.json)**: The actual response produced by Google Gemini (`gemini-3.5-flash-lite`) during the live API test run on November 10, 2026.
- **[`GROUNDING_AUDIT_REPORT.md`](./GROUNDING_AUDIT_REPORT.md)**: Full audit report detailing 100% number traceability, citation validity, role validation, hypothesis framing, and privacy compliance.
- **[`test_cqi_narrative_system.py`](./test_cqi_narrative_system.py)**: Runnable system audit script.

## Running the System Test

### 1. Offline Replay Mode (Default)
Validates the recorded live output against the synthetic facts:
```bash
python -B testing_modules/cqi_narrative_system_test/test_cqi_narrative_system.py
```

### 2. Live Gemini Execution Mode (`--live`)
Executes a fresh live call to Google Gemini using configured credentials in `OBELISK_LLM_API_KEYS`:
```bash
python -B testing_modules/cqi_narrative_system_test/test_cqi_narrative_system.py --live
```

# CQI Report Narrative Grounding Evaluation

This directory contains standalone grounding and accuracy evaluation for the CQI Report Narrative AI branch (`POST /analytics/cqi-narrative`).

## Execution Modes

1. **Offline Replay Mode (Default)**:
   Replays verified benchmark cases without making external network or paid API calls:
   ```bash
   python -B testing_modules/cqi_grounding_evaluation/evaluate.py
   ```
   Or with external recorded responses:
   ```bash
   python -B testing_modules/cqi_grounding_evaluation/evaluate.py --responses <path_to_responses.json>
   ```

2. **Live Gemini Generation (`--live`)**:
   Requires an explicit `--live` flag and configured Gemini API keys (`OBELISK_LLM_API_KEYS` / `OBELISK_LLM_MODEL`). Live mode never runs automatically.
   ```bash
   python -B testing_modules/cqi_grounding_evaluation/evaluate.py --live
   ```

## Evaluated Criteria

- **Schema Validity**: 100% adherence to `CQINarrativeOutput` structure and Pydantic field constraints.
- **Fact ID Validity**: 100% of cited `evidence_fact_ids` must exist in the supplied `<FACTS>` list.
- **Number Grounding**: 100% of numeric statistics, targets, and percentages mentioned in recommendations and hypotheses must trace back directly to supplied fact numbers. Untraceable or hallucinated numbers are rejected.
- **Constraint Compliance**: Allowed roles (`Faculty`, `Program Chair`, `Dean`, `VPAA`, `AQAU`), absence of personal names, absence of generic/grade-altering actions, and causes labelled as hypotheses.

> **Note**: Academic quality review remains a manual faculty/administrator rubric. Automated evaluation certifies structural compliance, citation integrity, and factual number grounding.

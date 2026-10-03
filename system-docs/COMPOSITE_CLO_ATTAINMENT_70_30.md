# 70/30 Composite CLO Attainment

**Scope:** Python ETL, backend persistence, rollups, and dependent reports  
**Formula version:** `70_30_v1`  
**Status:** Phase 1 (Python) and Phase 2 (backend) implementation reference

## 1. Summary

The backend already had the 70/30 constants and a composite helper, but the
ingest path did not compute or store the composite. Python extracted indirect
attainment, then the backend discarded it and stored the direct score as the
composite. Phase 1 moved composite calculation into the Python ETL. Phase 2
made backend ingest persist Python's direct, indirect, and composite values,
while manual score edits and CSV reimports preserve indirect attainment and
recompute only the composite.

## 2. Formula

```text
composite = (0.70 * direct_pct) + (0.30 * indirect_pct)
```

- Python direct input is a `0-1` fraction and is converted to `0-100` before
  applying the formula.
- Indirect input is already `0-100`.
- If indirect is `null`/missing, composite falls back to direct.
- Indirect `0` is a real score and is not treated as missing.
- The result is rounded to two decimals before the 70% threshold check.
- `met_threshold` and CLO level are evaluated from the rounded composite.
- The formula identifier is `70_30_v1`.

## 3. Scale table

| Surface | Field | Scale |
|---|---|---|
| Python extraction/transformation | `direct_clo_attainment_pct` | `0-1` fraction |
| Python extraction/transformation | `indirect_clo_attainment_pct` | `0-100`, nullable |
| Python output | `composite_clo_attainment_pct` | `0-100`, rounded to 2 decimals |
| Python output | `met_threshold` / `clo_level` | Derived from composite `0-100` |
| Backend ingest input | `direct_clo_attainment_pct` | Converted from `0-1` to `0-100` |
| Backend ingest input | `indirect_clo_attainment_pct` | `0-100`, nullable |
| Backend ingest input | `composite_clo_attainment_pct` | `0-100`, nullable in the input contract |
| Database `CloAttainment.directScorePct` | Direct score | `0-100` |
| Database `CloAttainment.indirectScorePct` | Indirect score | `0-100`, nullable |
| Database `CloAttainment.compositeScorePct` | Composite score | `0-100` |
| Backend rollups/CAR/CQI | `compositeScorePct` | `0-100` |
| Python `institutional_summary` output | `mean_attainment_pct` and PLO/program values | `0-1` fraction |

Both scales coexist. Do not pass a Python direct fraction to a backend
percentage field, and do not treat a Python institutional-summary value as a
backend percentage. In particular, `institutional_summary` intentionally
returns internal aggregate values as `0-1` fractions; its prompt multiplies
them by 100 for display.

## 4. Source of truth

Python computes the composite during ETL and sends it to the backend. Ingest
persists that value without recomputing it. The backend manual score-edit and
CSV reimport paths preserve the existing indirect score and recompute the
composite with `compositeScorePct()`.

These implementations must remain in parity: both use the same 70/30 weights,
null fallback, real-zero handling, and two-decimal rounding. The backend unit
tests prove null fallback, indirect zero, edit calculation, and rounding in
`apps/backend/test/unit/attainment.test.ts`. Python's
`apps/python-server/testing_modules/test_composite_attainment.py` covers the
Python formula, fallback, zero handling, scale validation, rounding boundary,
and workbook extraction.

## 5. Files changed

### Python server

- `apps/python-server/app/analytics/cqi_recommender.py` — evaluates gaps and builds AI context from composite attainment while retaining direct/indirect context.
- `apps/python-server/app/analytics/institutional_summary.py` — prefers composite values and converts them to the `0-1` institutional-summary scale.
- `apps/python-server/app/etl/composite_attainment.py` — adds the pure 70/30 calculation and CLO-level classification.
- `apps/python-server/app/etl/etl_const.py` — adds weights, formula identifiers, thresholds, and intermediate field names.
- `apps/python-server/app/etl/extract/extractor.py` — extracts the indirect rating needed by the transformer.
- `apps/python-server/app/etl/transform/transformer.py` — computes direct, indirect, composite, threshold, and level.
- `apps/python-server/app/schemas/class_record.py` — exposes indirect, composite, and formula fields.
- `apps/python-server/testing_modules/test_composite_attainment.py` — tests the Python calculation and extraction behavior.

### Backend

- `apps/backend/lib/validators/attainment.ts` — makes null/undefined indirect values fall back to direct while preserving indirect zero.
- `apps/backend/lib/ingest/score-edit.ts` — recomputes edited composites with the shared helper.
- `apps/backend/src/v1/ingest/service.ts` — persists Python values and preserves indirect values during edits/reimports.
- `apps/backend/test/unit/attainment.test.ts` — covers backend formula parity and edit behavior.

The Phase 2 commit also changed
`apps/python-server/app/analytics/cqi_recommender.py` so AI gap decisions use
composite attainment and include direct/indirect values as supporting context.
`apps/backend/src/v1/car/service.ts` was not changed by these commits; CAR
already reads the stored `compositeScorePct`.

## 6. Behavior changes users will see

| Surface | Expected behavior | Verification |
|---|---|---|
| At-Risk list/flags | Threshold status is based on Python's composite, and edited scores reconcile flags against the recomputed composite. | The threshold and flag paths are verified by code; database persistence and an edit crossing 70% are **UNVERIFIED** because backend integration tests were not run. |
| CAR Parts 3/4 | Aggregates use stored composite attainment. | Verified in backend CAR/compute code. |
| CAR Part 6 | Cross-references use the stored composite under the existing field name. | Verified in backend CAR code. |
| F15 | PLO attainment summary consumes composite-based section values. | Rollup path is verified in code; end-to-end output is **UNVERIFIED**. |
| F16 | Cohort tracking uses stored composite values for the per-CLO grid. | Verified in rollup code; end-to-end output is **UNVERIFIED**. |
| F22 | **UNVERIFIED:** the affected F22 consumer and its composite behavior could not be verified from the Phase 1/Phase 2 changes. | **UNVERIFIED** |
| CQI triggers | Composite values drive below-threshold gap identification and recommendations. | Verified in Python CQI code; live recommendation behavior is **UNVERIFIED**. |
| AI recommendations | Prompts describe composite attainment and include direct/indirect context. | Prompt construction is verified in code; generated output is **UNVERIFIED**. |

## 7. Webapp developer notes

The backend keeps existing API field names even where their values now mean
composite attainment:

- CAR Part 6 `directAttainmentPct` is populated from the stored composite
  value. The field name was retained for compatibility.
- CAR and other report payloads that expose `compositeScorePct` now receive
  the actual 70/30 composite rather than a direct-score mirror.
- Roster data separately exposes `directScorePct` and
  `compositeScorePct`; `indirectScorePct` is stored but is not part of the
  existing roster response shape.

The frontend must not assume that a field named `directAttainmentPct` is a
direct-instrument score, or that composite equals direct. It must also not
mix Python `0-1` institutional-summary fractions with backend `0-100`
percentages. A later API revision should rename CAR Part 6's field to
`compositeAttainmentPct`; that rename is not part of this change.

## 8. How to verify

1. Upload the AUN-OBE template and inspect student AA:
   - CLO1: direct `86.67`, indirect `60`, composite `78.67`.
   - CLO3: direct `100`, indirect `80`, composite `94.00`.
2. Edit a direct score and confirm the existing indirect score is preserved and
   only the composite changes.
3. Run the Python unit tests:

   ```text
   cd apps/python-server
   python -m pytest testing_modules/test_composite_attainment.py
   ```

4. Run the backend unit tests:

   ```text
   cd apps/backend
   bun test test/unit/attainment.test.ts
   ```

Backend integration verification additionally requires a local Postgres and
has not been completed.

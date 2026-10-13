# OBELISK ETL Service - Formula Reference

This document describes the Outcomes-Based Education (OBE) calculations
implemented in this service. Existing source labels cite the JMCFI WIN-OBE
Assessment Plan, AUN-OBE specification or client clarification; this code/document
synchronization does not independently certify institutional approval or source
manual wording. It changes no calculation code or policy.

---

## Part 1: Per-Course Transformation (`transformer.py`)

These formulas are applied to extracted class records during the ETL process initiated by a `POST /upload` request.

### Formula 1A: Direct CLO Attainment (Independent Recomputation)

-   **Purpose**: To calculate the direct attainment of a single Course Learning Outcome (CLO) for an individual student.
-   **Source**: WIN-OBE Assessment Plan, §3.5.1 / AUN-OBE Template
-   **Formula**:
    $$\text{direct\_clo\_attainment\_pct} = \frac{\text{Prelim Score} + \text{Midterm Score} + \text{Final Score}}{\text{Prelim Max} + \text{Midterm Max} + \text{Final Max}}$$
-   **Implementation Notes**:
    - Recomputed independently from the six raw score/max cells in each CLO block of the "Direct CLO" sheet.
    - OBELISK **never** reads or trusts the Excel workbook's own "Attainment %" formula column.
    - If total maximum possible score is zero, attainment is returned as `null`.

### Formula 1B: Indirect CLO Attainment (Per-Student, Independent Recomputation)

-   **Purpose**: To calculate per-student indirect attainment for a CLO from the exit survey Likert rating.
-   **Source**: AUN-OBE Template Specification
-   **Formula**:
    $$\text{indirect\_clo\_attainment\_pct} = \left(\frac{\text{Rating}}{5.0}\right) \times 100$$
-   **Implementation Notes**:
    - Recomputed directly from the raw 1–5 Likert `Rating` column in the "Indirect CLO" sheet.
    - OBELISK **never** reads the Excel sheet's formula column.
    - Emitted in `StudentCLOAttainment` as a percentage (e.g., `80.0` for a rating of 4). If no rating is recorded, emitted as `null`.

### Composite CLO Attainment and Institutional Threshold

-   **Purpose**: To combine direct and indirect attainment before threshold and level classification.
-   **Formula**:
    $$\text{composite} = (0.70 \times \text{direct\_pct}) + (0.30 \times \text{indirect\_pct})$$
-   **Scales**: `direct_clo_attainment_pct` is a `0-1` fraction and is converted
    to `0-100`; indirect attainment is already `0-100`. Accepted extra credit
    can exceed those nominal direct/composite ranges and is not clamped.
-   **Fallback**: When indirect is `null`, composite falls back to direct.
    Indirect `0` is a real value.
-   **Rounding**: Composite is rounded to two decimals before classification.
-   **Missing direct evidence**: A zero maximum-score sum yields null direct,
    composite, threshold and level values, rather than a measured zero.
-   **Version**: `SimpleTransformer._formula_version()` returns `70_30_v1`.

-   **Purpose**: To determine if a student's composite CLO attainment meets the institutional standard for proficiency.
-   **Source**: Functional Requirements FR-03, FR-12, FR-20
-   **Formula**:
    ```
    composite_clo_attainment_pct >= 70.00
    ```
-   **Implementation Notes**: The `met_threshold` boolean field is **always** calculated against the fixed institutional benchmark of 70% (ratio `0.70`).

### 4-Tier Performance Levels for `clo_level`

-   **Purpose**: To classify a student's composite attainment into a descriptive performance level.
-   **Function**: `compute_clo_level()` in `app/etl/composite_attainment.py`
-   **Source**: WIN-OBE Assessment Plan, §3.1.1 ("CLO Attainment Levels")
-   **Formula**:
    -   `>= 85.00%` $\rightarrow$ `"Exceptional"`
    -   `>= 70.00%` and `< 85.00%` $\rightarrow$ `"Proficient"`
    -   `>= 60.00%` and `< 70.00%` $\rightarrow$ `"Basic"`
    -   `< 60.00%` $\rightarrow$ `"Below Basic"`

### Rule 1: Data Completeness Standard (Per-Student, Per-CLO)

-   **Purpose**: To verify that a student's record for a given CLO is complete across grading periods.
-   **Source**: WIN-OBE Assessment Plan, §3.6
-   **Formula**:
    ```
    A student's record for a CLO is complete if they have non-null scores in:
    Prelim, Midterm, AND Final periods.
    ```
-   **Implementation Notes**:
    - Produces `is_record_complete` boolean on each `StudentCLOAttainment` record.
    - Rolled up into section-wide completeness percentage (`section_completeness_pct`).
    - `rule1_met` is `True` when `section_completeness_pct >= 0.60`.

### CLO-PLO Mapping Retirement & `excluded_reason`

-   **Status**: PERMANENTLY RETIRED from python-server.
-   **Details**: Mapping definitions are managed in the webapp; Python Excel ingestion returns an empty mapping and does not filter student attainments by it. Institutional analytics still consumes mappings supplied in the HTTP payload for PLO rollups.
-   **Output Contract**: `excluded_reason` is retained in `StudentCLOAttainment` schema for shape stability with existing consumers, but is **always `null`**.

---

## Part 2: Institutional Analytics (`institutional_summary.py`)

These formulas are applied when the `POST /analytics/institutional-summary` or `POST /analytics/summary` endpoint is called with a consolidated payload of multiple course results.

### Formula 2A: Section CLO Attainment (Mean)

-   **Purpose**: To calculate average composite attainment for a single CLO across all students in a group.
-   **Formula**:
    $$\text{Mean CLO Attainment} = \frac{\sum \text{eligible attainment fractions}}{\text{Total eligible student records}}$$
-   **Implementation**: Each eligible value is `composite_clo_attainment_pct / 100`,
    falling back to `direct_clo_attainment_pct` for that record when composite is
    null. Excluded records and records with neither value are omitted. API
    `mean_attainment_pct` is a fraction, not a 0–100 percentage. No eligible
    values yields `0.0` in the helper; group construction may omit the CLO.
    Grouping uses bare CLO codes across submissions; course identities are not
    part of that aggregation key. These are implementation details, not a new
    longitudinal/curriculum policy.

### Formula 7A: Per-PLO Attainment (Unweighted Average)

-   **Purpose**: To compute the attainment of a Program Learning Outcome (PLO) by rolling up the attainment of all CLOs mapped to it in the payload.
-   **Formula**:
    $$\text{PLO Attainment} = \frac{\sum \text{Mean Attainment of mapped CLOs}}{\text{Total number of mapped CLOs}}$$
-   **API naming**: The retained key `plo_attainment_direct_only` carries this
    mean of composite-or-direct fractions despite its legacy name. Mapping
    correlation strengths are informational, not weights in this average.

### Formula 7C: Program-Level Average PLO Attainment

-   **Purpose**: To compute a summary average of all PLO attainment values across an entire degree program.
-   **Formula**:
    $$\text{Program PLO Average} = \frac{\sum \text{PLO attainments in program}}{\text{Total number of PLOs in program}}$$

### Rule 3: Data Completeness Standard (Per-PLO)

-   **Purpose**: To verify that a PLO has sufficient underlying data from its mapped CLOs.
-   **Formula**:
    $$\text{plo\_completeness\_pct} = \frac{\text{Count of mapped CLOs meeting Rule 1}}{\text{Total mapped CLOs}}$$
    $$\text{plo\_rule3\_met} = (\text{plo\_completeness\_pct} \ge 0.60)$$

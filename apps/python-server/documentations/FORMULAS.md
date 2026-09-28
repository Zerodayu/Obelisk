# OBELISK ETL Service - Formula Reference

This document provides a canonical reference for every official Outcomes-Based Education (OBE) calculation formula implemented in this service. Each formula is sourced from the official JMCFI WIN-OBE Assessment Plan manual, the AUN-OBE Template specification, or direct client clarification.

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

### Institutional Threshold for `met_threshold`

-   **Purpose**: To determine if a student's direct CLO attainment meets the institutional standard for proficiency.
-   **Source**: Functional Requirements FR-03, FR-12, FR-20
-   **Formula**:
    ```
    direct_clo_attainment_pct >= 0.70
    ```
-   **Implementation Notes**: The `met_threshold` boolean field is **always** calculated against the fixed institutional benchmark of 70% (ratio `0.70`).

### 4-Tier Performance Levels for `clo_level`

-   **Purpose**: To classify a student's direct attainment into a descriptive performance level.
-   **Function**: `_compute_clo_level()`
-   **Source**: WIN-OBE Assessment Plan, §3.1.1 ("CLO Attainment Levels")
-   **Formula**:
    -   `>= 85%` (0.85) $\rightarrow$ `"Exceptional"`
    -   `70% – 84%` (0.70–0.84) $\rightarrow$ `"Proficient"`
    -   `60% – 69%` (0.60–0.69) $\rightarrow$ `"Basic"`
    -   `< 60%` (< 0.60) $\rightarrow$ `"Below Basic"`

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
-   **Details**: CLO-PLO correlation is now configured and managed entirely within the webapp backend (Prisma / `curriculum_map`). Python server does not read, validate, or filter by CLO-PLO mappings.
-   **Output Contract**: `excluded_reason` is retained in `StudentCLOAttainment` schema for shape stability with existing consumers, but is **always `null`**.

---

## Part 2: Institutional Analytics (`institutional_summary.py`)

These formulas are applied when the `POST /analytics/institutional-summary` or `POST /analytics/summary` endpoint is called with a consolidated payload of multiple course results.

### Formula 2A: Section CLO Attainment (Mean)

-   **Purpose**: To calculate average direct attainment for a single CLO across all students in a group.
-   **Formula**:
    $$\text{Mean CLO Attainment} = \frac{\sum \text{direct\_clo\_attainment\_pct}}{\text{Total eligible student records}}$$

### Formula 7A: Per-PLO Attainment (Unweighted Average)

-   **Purpose**: To compute the attainment of a Program Learning Outcome (PLO) by rolling up the attainment of all CLOs mapped to it in the payload.
-   **Formula**:
    $$\text{PLO Attainment} = \frac{\sum \text{Mean Attainment of mapped CLOs}}{\text{Total number of mapped CLOs}}$$

### Formula 7C: Program-Level Average PLO Attainment

-   **Purpose**: To compute a summary average of all PLO attainment values across an entire degree program.
-   **Formula**:
    $$\text{Program PLO Average} = \frac{\sum \text{PLO attainments in program}}{\text{Total number of PLOs in program}}$$

### Rule 3: Data Completeness Standard (Per-PLO)

-   **Purpose**: To verify that a PLO has sufficient underlying data from its mapped CLOs.
-   **Formula**:
    $$\text{plo\_completeness\_pct} = \frac{\text{Count of mapped CLOs meeting Rule 1}}{\text{Total mapped CLOs}}$$
    $$\text{plo\_rule3\_met} = (\text{plo\_completeness\_pct} \ge 0.60)$$

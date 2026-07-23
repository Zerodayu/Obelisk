# OBELISK ETL Service - Formula Reference

This document provides a canonical reference for every official Outcomes-Based Education (OBE) calculation formula implemented in this service. Each formula is sourced from the official JMCFI WIN-OBE Assessment Plan manual or from direct client clarification.

---

## Part 1: Per-Course Transformation (`transformer.py`)

These formulas are applied to a single class record during the ETL process initiated by a `POST /upload` request.

### Formula 1A: Direct CLO Attainment

-   **Purpose**: To calculate the direct attainment of a single Course Learning Outcome (CLO) for an individual student.
-   **Function**: `_compute_direct_clo_attainment()`
-   **Source**: WIN-OBE Assessment Plan, §3.5.1
-   **Formula**:
    ```
    (Sum of raw scores on all assessments mapped to this CLO)
    ---------------------------------------------------------
    (Sum of max possible scores for those same assessments)
    ```
-   **Implementation Notes**: This is a simple pooling of all scores. It does not use any weighting by assessment category (TLA, AT, EXAM, etc.).

### Institutional Threshold for `met_threshold`

-   **Purpose**: To determine if a student's direct CLO attainment meets the institutional standard for proficiency.
-   **Source**: Functional Requirements FR-03, FR-12, FR-20
-   **Formula**:
    ```
    direct_clo_attainment_pct >= 0.70
    ```
-   **Implementation Notes**: The `met_threshold` boolean field is **always** calculated against the fixed institutional benchmark of 70%. It does **not** use the per-course threshold value that may be present in the source workbook.

### 4-Tier Performance Levels for `clo_level`

-   **Purpose**: To classify a student's attainment into a descriptive performance level.
-   **Function**: `_compute_clo_level()`
-   **Source**: WIN-OBE Assessment Plan, §3.5.1 (Descriptive Levels)
-   **Formula**:
    -   `>= 85%` → `"Exceptional"`
    -   `70% – 84%` → `"Proficient"`
    -   `60% – 69%` → `"Basic"`
    -   `< 60%` → `"Below Basic"`

### Rule 1: Data Completeness Standard (Per-Student, Per-CLO)

-   **Purpose**: To check if a student's record for a given CLO is complete enough for reliable analysis.
-   **Function**: `_check_record_completeness()`
-   **Source**: WIN-OBE Assessment Plan, §3.6
-   **Formula**:
    ```
    A student's record for a CLO is "complete" if they have at least one non-null score in EACH of the three grading periods: PRELIM, MIDTERM, and FINAL.
    ```
-   **Implementation Notes**: This check produces the `is_record_complete` boolean field on each `StudentCLOAttainment` record. This is then rolled up into a section-wide `section_completeness_pct` and `rule1_met` boolean.

---

## Part 2: Institutional Analytics (`institutional_summary.py`)

These formulas are applied when the `POST /analytics/institutional-summary` endpoint is called with a consolidated payload of multiple course results.

### Formula 2A: Section CLO Attainment (Mean)

-   **Purpose**: To calculate the average attainment for a single CLO across all students in a given group (e.g., a department, a program).
-   **Function**: `_calculate_mean_attainment_pct()`
-   **Source**: WIN-OBE Assessment Plan, §3.5.2
-   **Formula**:
    ```
    (Sum of all individual direct_clo_attainment_pct values for this CLO)
    --------------------------------------------------------------------
    (Total number of student records for this CLO)
    ```
-   **Implementation Notes**: This is a true average of the attainment percentages, not a "pass rate" based on who met the threshold.

### Formula 7A: Per-PLO Attainment (Unweighted Average)

-   **Purpose**: To compute the attainment of a single Program Learning Outcome (PLO) by rolling up the attainment of all CLOs mapped to it within a specific scope (e.g., a program).
-   **Function**: `compute_plo_attainment()`
-   **Source**: WIN-OBE Assessment Plan, §3.5.7
-   **Formula**:
    ```
    (Sum of mean_attainment_pct for all CLOs mapped to this PLO)
    -----------------------------------------------------------
    (Total number of CLOs mapped to this PLO)
    ```
-   **Implementation Notes**: This is an unweighted average. It does not currently use `correlation_strength` or course credit units as a weight.

### Formula 7C: Program-Level Average PLO Attainment

-   **Purpose**: To compute a single, summary average of all PLO attainment values for an entire academic program.
-   **Function**: `_generic_aggregator()` (within the `is_program_level` block)
-   **Source**: Client Clarification (referred to as "Formula 7C")
-   **Formula**:
    ```
    (Sum of all individual plo_attainment_direct_only values in the program)
    -----------------------------------------------------------------------
    (Total number of PLOs in the program)
    ```
-   **Implementation Notes**: This calculation is performed **only** at the program level, never at the department or AVP-group level, as PLOs are specific to their parent program.

### Rule 3: Data Completeness Standard (Per-PLO)

-   **Purpose**: To check if a PLO has sufficient underlying data from its mapped CLOs to be considered reliably computed.
-   **Function**: `compute_plo_attainment()`
-   **Source**: WIN-OBE Assessment Plan, §3.6
-   **Formula**:
    ```
    A PLO meets the completeness standard if at least 60% of the CLOs mapped to it have met Rule 1.
    ```
-   **Implementation Notes**: This check produces the `plo_completeness_pct` and `plo_rule3_met` boolean fields for each PLO in the institutional summary.

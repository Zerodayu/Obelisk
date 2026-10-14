# OBELISK ETL Service - Constants Reference

This document provides a reference for the constants defined in `app/etl/etl_const.py` (v2, AUN-OBE Template). These constants are critical for the correct parsing of the JMCFI class record Excel workbooks and for the internal logic of the transformation process.

---

## 1. File Structure

The Direct/Indirect sheet layout constants and institutional calculation defaults listed here are centralized in `app/etl/etl_const.py`. This is not exhaustive centralization: `extractor.py` still hardcodes some SETUP metadata cell addresses, including `B3`, `D3`, `B4`, `D4`, `B5`, `B6`, `H9` and `E9`. These remain implementation details; this documentation update does not relocate them. The defined constants are organized into classes by function:

-   **Sheet Names**: `SheetNames`
-   **Template Validation**: `TemplateValidation`
-   **Direct CLO Sheet**: `DirectCloSheet` (and `BlockOffsets`)
-   **Indirect CLO Sheet**: `IndirectCloSheet` (and `BlockOffsets`)
-   **Dynamic Detection**: `CloDetection`, `StudentRosterDetection`
-   **Transformation Constants**: `Transformation` (and its inner classes)

---

## 2. Sheet Names

### `SheetNames`
Contains the standardized worksheet names for the AUN-OBE template:
-   `DIRECT_CLO`: `"Direct CLO"`
-   `INDIRECT_CLO`: `"Indirect CLO"`
-   `SETUP`: `"SETUP"`

> **Important**: The old sheets (`Database (LECTURE-RES-PRAC)`, `Exam (LECTURE ONLY)`, `COVERPAGE`, `OUTPUT`) and any `Dashboard` live-formula tab are completely ignored and retired from extraction.

---

## 3. Template Validation

### `TemplateValidation`
Constants used to validate the template version and required worksheets before extraction. In the upload workflow these checks occur in the worker after saving/enqueuing, so an old-format workbook can receive HTTP 202 before the job fails with structured `MissingWorksheet` or `InvalidTemplate` metadata. See [the integration contract](INTEGRATION.md#http-errors-versus-worker-errors).

| Constant | Value | Description |
| :--- | :--- | :--- |
| `REQUIRED_SHEETS` | `("Direct CLO", "Indirect CLO")` | Mandatory worksheets that must exist in the workbook. |
| `DIRECT_CLO_MARKER_CELL` | `A1` | Cell in `Direct CLO` sheet containing the title marker. |
| `DIRECT_CLO_MARKER_VALUE`| `"DIRECT CLO — PER-STUDENT RAW SCORES"` | Expected text in cell `A1` of `Direct CLO`. |
| `INDIRECT_CLO_MARKER_CELL`| `A1` | Cell in `Indirect CLO` sheet containing the title marker. |
| `INDIRECT_CLO_MARKER_VALUE`| `"INDIRECT CLO — COURSE EXIT SURVEY RESPONSES"` | Expected text in cell `A1` of `Indirect CLO`. |

---

## 4. Extraction Layout Constants

### `DirectCloSheet`
Defines the layout of the repeating 7-column blocks for Direct CLO scores:

-   `CLO_LABEL_ROW`: `3` (e.g. C3 = `"CLO1"`, J3 = `"CLO2"`)
-   `SUBFIELD_HEADER_ROW`: `4` (`"Prelim Score"`, `"Prelim Max"`, etc.)
-   `DATA_START_ROW`: `5` (First row of student data)
-   `FIRST_BLOCK_START_COL`: `3` (Column C, 1-indexed)
-   `BLOCK_WIDTH`: `7` (Columns per CLO block)
-   `STUDENT_ID_COL`: `"A"`
-   `STUDENT_NAME_COL`: `"B"`
-   `SUMMARY_ROW_LABEL_COL`: `"B"`
-   `SUMMARY_ROW_LABEL_PREFIX`: `"CLASS AVERAGE"` (Roster extraction halts when this label is encountered)

#### `DirectCloSheet.BlockOffsets` (0-indexed within each block)
-   `PRELIM_SCORE`: `0`
-   `PRELIM_MAX`: `1`
-   `MIDTERM_SCORE`: `2`
-   `MIDTERM_MAX`: `3`
-   `FINAL_SCORE`: `4`
-   `FINAL_MAX`: `5`
-   `ATTAINMENT_PCT`: `6` *(Excel formula column; ignored and recomputed independently by OBELISK)*

### `IndirectCloSheet`
Defines the layout of the repeating 2-column blocks for Indirect CLO ratings:

-   `HEADER_ROW`: `4`
-   `DATA_START_ROW`: `5`
-   `FIRST_BLOCK_START_COL`: `3` (Column C, 1-indexed)
-   `BLOCK_WIDTH`: `2` (Columns per CLO block)
-   `STUDENT_ID_COL`: `"A"`
-   `STUDENT_NAME_COL`: `"B"`
-   `SUMMARY_ROW_LABEL_COL`: `"A"`
-   `SUMMARY_ROW_LABELS`: `("MEAN RATING (of 5)", "%age CO ATTAINMENT (Indirect)")`

#### `IndirectCloSheet.BlockOffsets` (0-indexed within each block)
-   `RATING`: `0` (Raw 1–5 Likert rating)
-   `ATTAINMENT_PCT`: `1` *(Excel formula column; ignored and recomputed independently as `(rating / 5) * 100`)*

---

## 5. Dynamic Detection Constants

### `CloDetection`
CLO count is dynamic, not fixed. Extractor scans starting at `FIRST_BLOCK_START_COL` stepping by `BLOCK_WIDTH` until a blank cell is encountered.
-   `CLO_LABEL_PREFIX`: `"CLO"`

### `StudentRosterDetection`
Student count is dynamic. Roster discovery ends at the first row where:
-   `STUDENT_ID_COL` and `STUDENT_NAME_COL` are blank, OR
-   The row contains a known summary row prefix/label.

---

## 6. Transformation Constants

### `Transformation`
Governs attainment calculations, thresholds and completeness. Some retained
versioning constants are no longer used to generate the output version:

| Constant | Value | Description |
| :--- | :--- | :--- |
| `INSTITUTIONAL_THRESHOLD` | `0.70` | Fixed 70% benchmark for `met_threshold`. |
| `COMPLETENESS_THRESHOLD` | `0.60` | 60% benchmark for `rule1_met`. |
| `DIRECT_WEIGHT`, `INDIRECT_WEIGHT` | `0.70`, `0.30` | Composite weights; direct fraction is converted to a percentage first. |
| `FORMULA_VERSION` | `"70_30_v1"` | Composite formula label; transformer currently returns the same literal. |
| `CLO_LEVEL_*_MIN` | `85.0`, `70.0`, `60.0` | Composite percentage minima for Exceptional, Proficient and Basic. |
| `FORMULA_VERSION_ID` | `"direct_attainment_v2_aunobe"` | Retained constant; current transformer output is the literal `70_30_v1`. |
| `FORMULA_VERSION_HASH_LENGTH` | `12` | Retained hash-length constant; no current output hash is generated. |

#### `Transformation.CloLevels`
Standardized descriptive labels:
-   `EXCEPTIONAL`: `"Exceptional"`
-   `PROFICIENT`: `"Proficient"`
-   `BASIC`: `"Basic"`
-   `BELOW_BASIC`: `"Below Basic"`

#### `Transformation.IntermediateKeys`
Standardized dictionary keys used internally:
-   `STUDENT_ID`, `STUDENT_NAME`, `CLO_CODE`, `DIRECT_CLO_ATTAINMENT_PCT`, `INDIRECT_CLO_ATTAINMENT_PCT`, `COMPOSITE_CLO_ATTAINMENT_PCT`, `EXCLUDED_REASON`, `IS_RECORD_COMPLETE`, `MET_THRESHOLD`, `CLO_LEVEL`, `GROUP_RECORDS`, `SECTION_COMPLETENESS_PCT`, `RULE1_MET`.

`AttainmentLevels` remains an alias of `Transformation.CloLevels` for existing
consumers and legacy tests. `FormulaKeys` retains `ID`, `INSTITUTIONAL_THRESHOLD`,
`COMPLETENESS_THRESHOLD`, `DIRECT_WEIGHT`, and `INDIRECT_WEIGHT`.

For workbook locations and safe verification commands, use the
[legacy test README](../testing_modules/old_test/README.md). Model selection is
a runtime setting in `app/core/config.py`, not an ETL constant; see the
[server configuration reference](../README.md#2-environment-configuration).

---

## 7. Retired Constants (from v1)

The following constants from v1 are permanently retired:
-   `SheetNames.DATABASE`, `SheetNames.EXAM`, `SheetNames.COVERPAGE`, `SheetNames.OUTPUT`
-   `GradingPeriod`, `AssessmentCategory`, `AssessmentNames` (scores now arrive as Prelim/Midterm/Final subtotals per CLO; no category split)
-   `CoverPageLabels`, `HeaderData`, `DatabaseSheet`, `ExamSheet`, `OutputSheet`, `Roster`
-   `CloPlo`: CLO-PLO mapping is permanently retired from python-server (managed in webapp via Prisma/curriculum_map).

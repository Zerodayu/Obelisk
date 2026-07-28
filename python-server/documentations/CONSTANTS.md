# OBELISK ETL Service - Constants Reference

This document provides a reference for the constants defined in `app/etl/etl_const.py`. These constants are critical for the correct parsing of the JMCFI class record Excel workbooks and for the internal logic of the transformation process.

---

## 1. File Structure

All constants are centralized in `app/etl/etl_const.py`. They are organized into classes that group them by function.

-   **Core Identifiers**: `SheetNames`, `GradingPeriod`, `AssessmentCategory`
-   **Extraction Constants**: `CoverPageLabels`, `AssessmentNames`, `HeaderData`, `Roster`, `DatabaseSheet`, `ExamSheet`, `OutputSheet`, `CloPlo`, `TemplateValidation`
-   **Transformation Constants**: `Transformation` (and its inner classes)

---

## 2. Core Identifiers

### `SheetNames`
Contains the exact string names of the worksheets the ETL process expects to find.

-   `DATABASE`: "Database (LECTURE-RES-PRAC)"
-   `EXAM`: "Exam (LECTURE ONLY)"
-   `COVERPAGE`: "COVERPAGE"
-   `OUTPUT`: "OUTPUT"

### `GradingPeriod`
Standardized strings for the three grading periods.

-   `PRELIM`, `MIDTERM`, `FINAL`

### `AssessmentCategory`
Standardized strings for the main assessment categories.

-   `TLA`, `AT`, `EXAM`, `OUTPUT`

---

## 3. Extraction Constants

These constants map directly to specific cells, rows, columns, and string values within the Excel template files.

### `CoverPageLabels`
Standardized labels for values sought on the `COVERPAGE` sheet. The ETL searches for these labels and takes the value from the adjacent cell.

-   `COURSE_CODE`, `COURSE_TITLE`, `SECTION`, `INSTRUCTOR_NAME`, `GRADING_SYSTEM`

### `AssessmentNames`
Standardized names for specific, recurring assessments.

-   `PRELIM_EXAM`, `MIDTERM_EXAM`, `FINAL_EXAM`

### `HeaderData` (in `Database` sheet)
Maps cell addresses in the `Database` sheet to the core metadata of the class record.

| Constant | Cell | Description |
| :--- | :--- | :--- |
| `SEMESTER_YEAR` | `B3` | The semester and school year. |
| `COURSE_CODE` | `B4` | The course code. |
| `COURSE_TITLE`| `B5` | The full title of the course. |
| ... | ... | ... |

### `Roster`
Defines the starting rows and column letters for student lists.

| Constant | Value | Sheet(s) | Description |
| :--- | :--- | :--- | :--- |
| `DATABASE_START_ROW` | `17` | `Database` | The first student's data begins on row 17. |
| `EXAM_AND_OUTPUT_START_ROW` | `22` | `Exam`, `Output` | The first student's data begins on row 22. |
| `STUDENT_ID_COL` | `"A"` | All | The column containing the student's ID number. |
| `STUDENT_NAME_COL` | `"B"` | All | The column containing the student's full name. |

### `DatabaseSheet`, `ExamSheet`, `OutputSheet`
These classes define the row numbers for key metadata and the column letters for assessment blocks in their respective sheets.

-   **`CLO_CODE_ROW`**: The row containing the CLO code mapped to an assessment.
-   **`MAX_SCORE_ROW`**: The row containing the maximum possible score.
-   **`*_COLS`**: Lists of column letters for each grading period.

### `CloPlo` (in `COVERPAGE` sheet)
Constants for locating and parsing the CLO-PLO mapping table.

| Constant | Value | Description |
| :--- | :--- | :--- |
| `TABLE_HEADER_CELL` | `A26` | The cell that must contain the text "CLO-PLO". |
| `PLO_HEADER_ROW` | `26` | The row containing the PLO code headers (e.g., "PLO1"). |
| `FIRST_CLO_ROW` | `27` | The first row containing a CLO and its correlation values. |
| `CLO_CODE_COL` | `1` | The column number containing the CLO codes. |
| `PLO_START_COL` | `2` | The first column number containing PLO data. |
| `END_OF_TABLE_SENTINEL` | `"AVERAGE"` | The string in the CLO column that marks the end of the table. |

### `TemplateValidation`
Constants used to validate that the correct template version is being used.

| Constant | Value | Description |
| :--- | :--- | :--- |
| `DEFAULT_EXPECTED_VALUE` | `"STUDENT NAME"` | The default header text to check for. |
| `DATABASE_STUDENT_NAME_CELL` | `B12` | The cell in the `Database` sheet that must contain the student name header. |
| `EXAM_OUTPUT_STUDENT_NAME_CELL` | `B18` | The cell in the `Exam` and `Output` sheets for the student name header. |

---

## 4. Transformation Constants

### `Transformation`
This class holds constants that govern the internal logic of the transformation and analytics steps.

| Constant | Value | Source | Description |
| :--- | :--- | :--- | :--- |
| `INSTITUTIONAL_THRESHOLD` | `0.70` | FR-03 | The fixed 70% benchmark for `met_threshold`. |
| `COMPLETENESS_THRESHOLD` | `0.60` | Plan §3.6 | The 60% benchmark for `rule1_met` and `plo_rule3_met`. |
| `CLO_LEVEL_*_MIN` | `0.85`, `0.70`, `0.60` | Plan §3.1.1 | Minimum attainment for "Exceptional", "Proficient", and "Basic" levels. |
| `FORMULA_VERSION_ID` | `"direct_..._v1"` | Internal | A string identifier for the calculation logic version. |
| `FORMULA_VERSION_HASH_LENGTH` | `12` | Internal | The desired length of the final formula hash. |

#### `Transformation.CloLevels`
Contains the standardized descriptive labels for the four CLO attainment levels.
- `EXCEPTIONAL`, `PROFICIENT`, `BASIC`, `BELOW_BASIC`

#### `Transformation.FormulaKeys`
Contains the standardized dictionary keys used to build the JSON payload for the formula version hash.
- `ID`, `INSTITUTIONAL_THRESHOLD`, `COMPLETENESS_THRESHOLD`

#### `Transformation.IntermediateKeys`
Contains the standardized dictionary keys used for the intermediate data structures passed between transformation steps. This ensures consistency within the `SimpleTransformer` class.
- `STUDENT_ID`, `STUDENT_NAME`, `CLO_CODE`, `DIRECT_CLO_ATTAINMENT_PCT`, etc.

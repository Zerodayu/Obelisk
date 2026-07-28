# OBELISK ETL Service - Constants Reference

This document provides a reference for the constants defined in `app/etl/etl_const.py`. These constants are critical for the correct parsing of the JMCFI class record Excel workbooks. They map directly to specific cells, rows, columns, and string values within the template files.

---

## 1. File Structure

All constants are centralized in `app/etl/etl_const.py`. They are organized into classes that group them by function or location within the Excel workbook.

---

## 2. Core Constants

### `SheetNames`
This class contains the exact string names of the worksheets the ETL process expects to find. If a sheet is renamed in the template, this class must be updated.

-   `DATABASE`: "Database (LECTURE-RES-PRAC)"
-   `EXAM`: "Exam (LECTURE ONLY)"
-   `COVERPAGE`: "COVERPAGE"
-   `OUTPUT`: "OUTPUT"

### `GradingPeriod`
Standardized strings for the three grading periods. These are used to categorize records during both extraction and transformation.

-   `PRELIM`: "PRELIM"
-   `MIDTERM`: "MIDTERM"
-   `FINAL`: "FINAL"

### `AssessmentCategory`
Standardized strings for the main assessment categories. These are used in the transformation and analytics stages.

-   `TLA`: "TLA" (Teaching/Learning Activity)
-   `AT`: "AT" (Assessment Task)
-   `EXAM`: "EXAM"
-   `OUTPUT`: "OUTPUT"

---

## 3. Cell and Row/Column Mappings

These constants pinpoint where specific data lives within the various worksheets.

### `HeaderData` (in `Database` sheet)
This class maps cell addresses in the `Database` sheet to the core metadata of the class record.

| Constant | Cell | Description |
| :--- | :--- | :--- |
| `SEMESTER_YEAR` | `B3` | The semester and school year (e.g., "1st Semester, SY 2023-2024"). |
| `COURSE_CODE` | `B4` | The course code (e.g., "CS 101"). |
| `COURSE_TITLE` | `B5` | The full title of the course. |
| `COURSE_TYPE` | `B6` | The course type (e.g., "LEC"). |
| `SECTION` | `B7` | The section name (e.g., "BSCS-3A"). |
| `NO_OF_STUDENTS` | `B8` | The number of registered students. |
| `INSTRUCTOR_NAME` | `B9` | The name of the instructor. |
| `THRESHOLD` | `B10` | The passing threshold percentage for the course. |
| `GRADING_SYSTEM` | `B11` | The grading system description (e.g., "Base 40"). |

### `Roster`
This class defines the starting rows for the student lists in different sheets.

| Constant | Value | Sheet(s) | Description |
| :--- | :--- | :--- | :--- |
| `DATABASE_START_ROW` | `17` | `Database` | The first student's data begins on row 17. Rows 1-16 are the header. |
| `EXAM_AND_OUTPUT_START_ROW` | `22` | `Exam`, `Output` | The first student's data begins on row 22. Rows 1-21 are headers. |

### `DatabaseSheet`
Constants for the assessment columns in the `Database` sheet.

| Constant | Value | Description |
| :--- | :--- | :--- |
| `ASSESSMENT_CATEGORY_ROW` | `12` | This row contains the category of the assessment (e.g., "Quiz", "Assignment"). |
| `ASSESSMENT_NO_ROW` | `13` | This row contains the number of the assessment (e.g., 1, 2). |
| `CLO_CODE_ROW` | `14` | This row contains the CLO code mapped to the assessment (e.g., "CLO1"). |
| `ACTIVITY_NAME_ROW` | `15` | This row contains the specific name of the activity. |
| `MAX_SCORE_ROW` | `16` | This row contains the maximum possible score for the assessment. |
| `PRELIM_COLS` | `["D", ...]` | The list of column letters for the Prelim grading period. |
| `MIDTERM_COLS` | `["AJ", ...]` | The list of column letters for the Midterm grading period. |
| `FINAL_COLS` | `["BP", ...]` | The list of column letters for the Final grading period. |

### `ExamSheet` & `OutputSheet`
Similar to `DatabaseSheet`, these define the row numbers for key metadata in the `Exam` and `Output` sheets.

-   **`CLO_CODE_ROW`**: Row `20`
-   **`MAX_SCORE_ROW`**: Row `21`
-   **`ACTIVITY_NAME_ROW`** (Output only): Row `19`
-   **`*_COLS`**: Lists of column letters for each grading period.

### `CloPlo` (in `COVERPAGE` sheet)
Constants for locating the CLO-PLO mapping table.

| Constant | Value | Description |
| :--- | :--- | :--- |
| `TABLE_HEADER_CELL` | `A26` | The cell that must contain the text "CLO-PLO". |
| `TABLE_HEADER_VALUE` | `"CLO-PLO"` | The expected value of the header cell. |
| `PLO_HEADER_ROW` | `26` | The row containing the PLO code headers (e.g., "PLO1", "PLO2"). |
| `FIRST_CLO_ROW` | `27` | The first row containing a CLO and its correlation values. |
| `END_OF_TABLE_SENTINEL` | `"AVERAGE"` | The string in column A that marks the end of the table data. |

---

## 4. Transformation and Analytics Constants

### `Transformation`
This class holds constants that govern the logic of the transformation and analytics steps. These are based on institutional policy, not the Excel template structure.

| Constant | Value | Source | Description |
| :--- | :--- | :--- | :--- |
| `INSTITUTIONAL_THRESHOLD` | `0.70` | FR-03, FR-12, FR-20 | The fixed 70% benchmark for determining if a student has "met" a CLO's attainment threshold. |
| `COMPLETENESS_THRESHOLD` | `0.60` | WIN-OBE Plan §3.6 | The minimum percentage of students (60%) who must have a complete record for a CLO or PLO for it to be considered valid for section-level analysis. |
| `CLO_LEVEL_*_MIN` | `0.85`, `0.70`, `0.60` | WIN-OBE Plan §3.1.1 | The minimum attainment percentages for the "Exceptional", "Proficient", and "Basic" performance levels, respectively. |
| `FORMULA_VERSION_ID` | `"direct_attainment_v1"` | Internal | A string identifier that is hashed to create a fingerprint for the calculation logic used. It changes only when the formulas themselves are updated. |

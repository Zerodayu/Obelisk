# --- Sheet Names ---
class SheetNames:
    """Standardized names of the worksheets within the class record workbook."""
    DATABASE = "Database (LECTURE-RES-PRAC)"
    EXAM = "Exam (LECTURE ONLY)"
    COVERPAGE = "COVERPAGE"
    OUTPUT = "OUTPUT"


# --- Grading Periods ---
class GradingPeriod:
    """Standardized names for the grading periods."""
    PRELIM = "PRELIM"
    MIDTERM = "MIDTERM"
    FINAL = "FINAL"


# --- Assessment Categories ---
class AssessmentCategory:
    """Standardized names for assessment categories used in transformation logic."""
    TLA = "TLA"
    AT = "AT"
    EXAM = "EXAM"
    OUTPUT = "OUTPUT"


# --- Cell/Row/Column Locations ---

class HeaderData:
    """Cell locations for the main header information in the 'Database' sheet."""
    # Cell B3: Semester and School Year (e.g., "1st Semester, SY 2023-2024")
    SEMESTER_YEAR = "B3"
    # Cell B4: Course Code (e.g., "CS 101")
    COURSE_CODE = "B4"
    # Cell B5: Course Title (e.g., "Introduction to Computing")
    COURSE_TITLE = "B5"
    # Cell B6: Course Type (e.g., "LEC")
    COURSE_TYPE = "B6"
    # Cell B7: Section (e.g., "BSCS-3A")
    SECTION = "B7"
    # Cell B8: Number of registered students
    NO_OF_STUDENTS = "B8"
    # Cell B9: Name of the instructor
    INSTRUCTOR_NAME = "B9"
    # Cell B10: Passing threshold percentage (e.g., 50.0)
    THRESHOLD = "B10"
    # Cell B11: Grading system description (e.g., "Base 40")
    GRADING_SYSTEM = "B11"

    # Cells for component weights (e.g., "Class Standing", "Exam")
    # D5 contains the name of the first component (e.g., "PRELIM CS")
    WEIGHT_COMPONENT_1_NAME = "D5"
    # D6 contains the percentage weight for the first component
    WEIGHT_COMPONENT_1_VALUE = "D6"
    # E5 contains the name of the second component (e.g., "PRELIM EXAM")
    WEIGHT_COMPONENT_2_NAME = "E5"
    # E6 contains the percentage weight for the second component
    WEIGHT_COMPONENT_2_VALUE = "E6"
    # F5 contains the name of the third component (e.g., "MIDTERM CS")
    WEIGHT_COMPONENT_3_NAME = "F5"
    # F6 contains the percentage weight for the third component
    WEIGHT_COMPONENT_3_VALUE = "F6"


class Roster:
    """Constants related to student roster sections in different sheets."""
    # Row 17 is where the first student row begins in the "Database (LECTURE-RES-PRAC)" sheet.
    # Rows 1-16 are the header block (course info, weights, threshold).
    DATABASE_START_ROW = 17
    # Row 22 is where the first student row begins in the "Exam (LECTURE ONLY)" and "OUTPUT" sheets.
    # Rows 1-21 in these sheets are for header info and assessment columns.
    EXAM_AND_OUTPUT_START_ROW = 22


class DatabaseSheet:
    """Constants for the 'Database (LECTURE-RES-PRAC)' sheet."""
    # Row 12 contains the assessment category (e.g., "Quiz", "Assignment").
    ASSESSMENT_CATEGORY_ROW = 12
    # Row 13 contains the assessment number (e.g., 1, 2, 3).
    ASSESSMENT_NO_ROW = 13
    # Row 14 contains the CLO code (e.g., "CLO1", "CLO2").
    CLO_CODE_ROW = 14
    # Row 15 contains the specific activity name (e.g., "Quiz 1 - Set A").
    ACTIVITY_NAME_ROW = 15
    # Row 16 contains the maximum possible score for the assessment.
    MAX_SCORE_ROW = 16

    # Columns for Prelim period assessments.
    PRELIM_COLS = ["D", "E", "F", "G", "H", "I", "J"]
    # Columns for Midterm period assessments.
    MIDTERM_COLS = ["AJ", "AK", "AL", "AM", "AN", "AO", "AP", "AQ", "AR", "AS", "AT", "AU", "AV"]
    # Columns for Final period assessments.
    FINAL_COLS = ["BP", "BQ", "BR", "BS", "BT", "BU", "BV", "BW", "BX", "BY", "BZ"]


class ExamSheet:
    """Constants for the 'Exam (LECTURE ONLY)' sheet."""
    # Row 20 contains the CLO code for the exam component.
    CLO_CODE_ROW = 20
    # Row 21 contains the maximum possible score for the exam component.
    MAX_SCORE_ROW = 21

    # Column for the Prelim Exam.
    PRELIM_COLS = ["D"]
    # Columns for the Midterm Exam (often split into parts).
    MIDTERM_COLS = ["O", "P"]
    # Columns for the Final Exam (often split into parts).
    FINAL_COLS = ["Z", "AA", "AB"]


class OutputSheet:
    """Constants for the 'OUTPUT' sheet, typically for major course outputs or projects."""
    # Row 19 contains the activity name for the output.
    ACTIVITY_NAME_ROW = 19
    # Row 20 contains the CLO code for the output.
    CLO_CODE_ROW = 20
    # Row 21 contains the maximum possible score for the output.
    MAX_SCORE_ROW = 21

    # Columns for Prelim period outputs.
    PRELIM_COLS = ["D", "E"]
    # Column for Midterm period outputs.
    MIDTERM_COLS = ["O"]
    # Column for Final period outputs.
    FINAL_COLS = ["Z"]


class CloPlo:
    """Constants for the CLO-PLO mapping table on the 'COVERPAGE' sheet."""
    # Cell A26 should contain the header "CLO-PLO" to identify the table.
    TABLE_HEADER_CELL = "A26"
    # The value expected in the header cell to validate the table's presence.
    TABLE_HEADER_VALUE = "CLO-PLO"
    # Row 26 contains the PLO code headers (e.g., "PLO1", "PLO2").
    PLO_HEADER_ROW = 26
    # Row 27 is the first row containing a CLO code and its correlation values.
    FIRST_CLO_ROW = 27
    # The string "AVERAGE" is used in column A to mark the end of the CLO rows.
    END_OF_TABLE_SENTINEL = "AVERAGE"


# --- Transformation Constants ---

class Transformation:
    # The institutional threshold (70%) is the minimum direct CLO attainment a student must achieve
    # to be considered as having "met" the CLO.
    # Source: FR-03, FR-12, and FR-20.
    INSTITUTIONAL_THRESHOLD = 0.70

    # The completeness threshold (60%) is the minimum percentage of students in a section
    # who must have a "complete" record for a given CLO for that CLO's section-level
    # data to be considered valid under Rule 1.
    # Source: WIN-OBE Assessment Plan, §3.6.
    COMPLETENESS_THRESHOLD = 0.60

    # --- CLO Attainment Level Thresholds ---
    # These values define the 4-tier descriptive levels for CLO attainment.
    # Source: WIN-OBE Assessment Plan, §3.1.1.

    # Minimum attainment percentage for the "Exceptional" level (>= 85%).
    CLO_LEVEL_EXCEPTIONAL_MIN = 0.85
    # Minimum attainment percentage for the "Proficient" level (>= 70%).
    CLO_LEVEL_PROFICIENT_MIN = 0.70
    # Minimum attainment percentage for the "Basic" level (>= 60%).
    CLO_LEVEL_BASIC_MIN = 0.60

    # --- Formula Versioning ---

    # This string identifies the version of the calculation logic used in this transformer.
    # It is hashed into the final `formula_version` field and should only be changed
    # when the underlying formulas (e.g., direct attainment) are modified.
    FORMULA_VERSION_ID = "direct_attainment_v1"


# --- DEPRECATED CONSTANTS ---
# These are kept for backward compatibility but should be replaced by the more specific constants above.

DATABASE_SHEET_COLUMNS = {
    GradingPeriod.PRELIM:  DatabaseSheet.PRELIM_COLS,
    GradingPeriod.MIDTERM: DatabaseSheet.MIDTERM_COLS,
    GradingPeriod.FINAL:   DatabaseSheet.FINAL_COLS,
}

class SheetVariables:
    student_list_start = 17

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


# --- Standardized Names & Labels ---
class CoverPageLabels:
    """Standardized labels for values sought on the COVERPAGE sheet."""
    COURSE_CODE = "Course Code:"
    COURSE_TITLE = "Course Title:"
    SECTION = "Section:"
    INSTRUCTOR_NAME = "Instructor's Name"
    GRADING_SYSTEM = "GRADING SYSTEM"


class AssessmentNames:
    """Standardized names for specific, recurring assessments."""
    PRELIM_EXAM = "Prelim Exam"
    MIDTERM_EXAM = "Midterm Exam"
    FINAL_EXAM = "Final Exam"


# --- Cell/Row/Column Locations ---

class HeaderData:
    """Cell locations for the main header information in the 'Database' sheet."""
    SEMESTER_YEAR = "B3"
    COURSE_CODE = "B4"
    COURSE_TITLE = "B5"
    COURSE_TYPE = "B6"
    SECTION = "B7"
    NO_OF_STUDENTS = "B8"
    INSTRUCTOR_NAME = "B9"
    THRESHOLD = "B10"
    GRADING_SYSTEM = "B11"
    WEIGHT_COMPONENT_1_NAME = "D5"
    WEIGHT_COMPONENT_1_VALUE = "D6"
    WEIGHT_COMPONENT_2_NAME = "E5"
    WEIGHT_COMPONENT_2_VALUE = "E6"
    WEIGHT_COMPONENT_3_NAME = "F5"
    WEIGHT_COMPONENT_3_VALUE = "F6"


class Roster:
    """Constants related to student roster sections in different sheets."""
    DATABASE_START_ROW = 17
    EXAM_AND_OUTPUT_START_ROW = 22
    STUDENT_ID_COL = "A"
    STUDENT_NAME_COL = "B"


class DatabaseSheet:
    """Constants for the 'Database (LECTURE-RES-PRAC)' sheet."""
    ASSESSMENT_CATEGORY_ROW = 12
    ASSESSMENT_NO_ROW = 13
    CLO_CODE_ROW = 14
    ACTIVITY_NAME_ROW = 15
    MAX_SCORE_ROW = 16
    PRELIM_COLS = ["D", "E", "F", "G", "H", "I", "J"]
    MIDTERM_COLS = ["AJ", "AK", "AL", "AM", "AN", "AO", "AP", "AQ", "AR", "AS", "AT", "AU", "AV"]
    FINAL_COLS = ["BP", "BQ", "BR", "BS", "BT", "BU", "BV", "BW", "BX", "BY", "BZ"]


class ExamSheet:
    """Constants for the 'Exam (LECTURE ONLY)' sheet."""
    CLO_CODE_ROW = 20
    MAX_SCORE_ROW = 21
    PRELIM_COLS = ["D"]
    MIDTERM_COLS = ["O", "P"]
    FINAL_COLS = ["Z", "AA", "AB"]


class OutputSheet:
    """Constants for the 'OUTPUT' sheet, typically for major course outputs or projects."""
    ACTIVITY_NAME_ROW = 19
    CLO_CODE_ROW = 20
    MAX_SCORE_ROW = 21
    PRELIM_COLS = ["D", "E"]
    MIDTERM_COLS = ["O"]
    FINAL_COLS = ["Z"]


class CloPlo:
    """Constants for the CLO-PLO mapping table on the 'COVERPAGE' sheet."""
    TABLE_HEADER_CELL = "A26"
    TABLE_HEADER_VALUE = "CLO-PLO"
    PLO_HEADER_ROW = 26
    FIRST_CLO_ROW = 27
    END_OF_TABLE_SENTINEL = "AVERAGE"
    CLO_CODE_COL = 1
    PLO_START_COL = 2


class TemplateValidation:
    """Constants for validating the template version by checking for expected header text."""
    DEFAULT_EXPECTED_VALUE = "STUDENT NAME"
    DATABASE_STUDENT_NAME_CELL = "B12"
    EXAM_OUTPUT_STUDENT_NAME_CELL = "B18"


# --- Transformation Constants ---

class Transformation:
    """Constants that govern the logic of the transformation and analytics steps."""
    INSTITUTIONAL_THRESHOLD = 0.70
    COMPLETENESS_THRESHOLD = 0.60
    CLO_LEVEL_EXCEPTIONAL_MIN = 0.85
    CLO_LEVEL_PROFICIENT_MIN = 0.70
    CLO_LEVEL_BASIC_MIN = 0.60
    FORMULA_VERSION_ID = "direct_attainment_v1"
    FORMULA_VERSION_HASH_LENGTH = 12

    class CloLevels:
        EXCEPTIONAL = "Exceptional"
        PROFICIENT = "Proficient"
        BASIC = "Basic"
        BELOW_BASIC = "Below Basic"

    class FormulaKeys:
        ID = "formula"
        INSTITUTIONAL_THRESHOLD = "institutional_threshold"
        COMPLETENESS_THRESHOLD = "completeness_threshold"

    class IntermediateKeys:
        STUDENT_ID = "student_id"
        STUDENT_NAME = "student_name"
        CLO_CODE = "clo_code"
        IS_RECORD_COMPLETE = "is_record_complete"
        DIRECT_CLO_ATTAINMENT_PCT = "direct_clo_attainment_pct"
        MET_THRESHOLD = "met_threshold"
        CLO_LEVEL = "clo_level"
        GROUP_RECORDS = "_group_records"
        SECTION_COMPLETENESS_PCT = "section_completeness_pct"
        RULE1_MET = "rule1_met"


# --- DEPRECATED CONSTANTS ---
# These are kept for backward compatibility but should be replaced by the more specific constants above.

DATABASE_SHEET_COLUMNS = {
    GradingPeriod.PRELIM:  DatabaseSheet.PRELIM_COLS,
    GradingPeriod.MIDTERM: DatabaseSheet.MIDTERM_COLS,
    GradingPeriod.FINAL:   DatabaseSheet.FINAL_COLS,
}

class SheetVariables:
    student_list_start = 17

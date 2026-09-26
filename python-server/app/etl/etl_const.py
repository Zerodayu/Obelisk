"""
OBELISK ETL constants — v2
Target template: JMCFI Class Record (AUN-OBE format)
Source-of-truth tabs: "Direct CLO" and "Indirect CLO" ONLY.

NOTE: Some copies of this workbook contain a "Dashboard" tab whose own header
claims to be "the ONLY tab OBELISK reads" and pre-computes Composite/At-Risk
values via Excel formulas. That tab is a leftover from an outdated template
version — do NOT read it. Reading it would silently reintroduce the exact
"Excel computes OBELISK's job for it" problem already resolved with the
client. If a workbook still has a live-formula Dashboard tab, treat the whole
workbook as an outdated template and extract from Direct CLO / Indirect CLO
regardless of what Dashboard contains.
"""


class SheetNames:
    """Worksheet names in the AUN-OBE class record template."""
    DIRECT_CLO = "Direct CLO"
    INDIRECT_CLO = "Indirect CLO"
    SETUP = "SETUP"
    # TODO(harold): confirm SETUP's actual layout. Best guess is it now holds
    # course header metadata (course code/title/section/instructor/AY/program)
    # that used to live in the old Database sheet's HeaderData cells.
    # It does NOT need a CLO-PLO matrix — see CLO-PLO MAPPING DECISION below.
    # Nothing below is defined for SETUP until that's verified against the
    # real tab content — do not guess cell coordinates for it.


# =============================================================================
# DECISION: CLO-PLO mapping is OUT OF SCOPE for python-server, permanently.
# =============================================================================
# Faculty already define CLO-PLO correlation once, in the webapp, via
# curriculum_map / CloToPloMapService (Phase 5, backend-owned, Prisma-backed).
# Requiring the same mapping to also be re-entered in the Excel class record
# would be duplicate data entry for the same fact, maintained in two places —
# exactly the kind of redundant encoding OBELISK exists to eliminate.
#
# Consequence: the old v1 `no_plo_mapping` exclusion feature (python-server
# reading a CLO-PLO correlation matrix off the Excel COVERPAGE sheet and
# nulling attainment for unmapped CLOs) is RETIRED for this template. It is
# not being re-pointed at SETUP or anywhere else. python-server has no
# opinion on CLO-PLO mapping at all going forward.
#
# python-server's only job re: CLOs is to dynamically discover whatever CLO
# blocks exist in a given Excel file (see CloDetection below) and report
# their attainment as-is. It does NOT validate those CLOs against what the
# webapp has registered for that course, and does NOT decide whether a CLO
# is "valid," mapped, or in-scope. That reconciliation — matching reported
# CLOs against curriculum_map, deciding what to do with an unexpected code —
# is entirely the backend/webapp's responsibility, the same way Student/CLO
# matching against the DB is already backend's job in Phase 1.
#
# In short: python-server emits data. It is not a source of truth for
# whether that data is correct, complete, or expected — the webapp is.
# =============================================================================


class TemplateValidation:
    """
    Marker-cell / sheet-presence checks, following the same OBELISKError
    pattern as v1 (MissingWorksheet / InvalidTemplate) — just re-pointed at
    the new tab names. An old-format upload (Database/Exam/OUTPUT/COVERPAGE
    sheets) must fail here with a structured error, not fall through.
    """
    REQUIRED_SHEETS = (SheetNames.DIRECT_CLO, SheetNames.INDIRECT_CLO)

    DIRECT_CLO_MARKER_CELL = "A1"
    DIRECT_CLO_MARKER_VALUE = "DIRECT CLO — PER-STUDENT RAW SCORES"

    INDIRECT_CLO_MARKER_CELL = "A1"
    INDIRECT_CLO_MARKER_VALUE = "INDIRECT CLO — COURSE EXIT SURVEY RESPONSES"


class DirectCloSheet:
    """
    Layout of the 'Direct CLO' tab.
    One repeating 7-column block per CLO: Prelim Score, Prelim Max,
    Midterm Score, Midterm Max, Final Score, Final Max, CLO_n Attainment %.
    """
    CLO_LABEL_ROW = 3          # e.g. C3="CLO1", J3="CLO2" — stride of BLOCK_WIDTH cols
    SUBFIELD_HEADER_ROW = 4    # "Prelim Score" / "Prelim Max" / ... / "CLO_n Attainment %"
    DATA_START_ROW = 5

    FIRST_BLOCK_START_COL = 3  # column C (1-indexed)
    BLOCK_WIDTH = 7            # columns per CLO block

    STUDENT_ID_COL = "A"
    STUDENT_NAME_COL = "B"

    class BlockOffsets:
        """0-indexed offsets from a block's start column."""
        PRELIM_SCORE = 0
        PRELIM_MAX = 1
        MIDTERM_SCORE = 2
        MIDTERM_MAX = 3
        FINAL_SCORE = 4
        FINAL_MAX = 5
        ATTAINMENT_PCT = 6
        # NOTE: this column is an Excel formula. OBELISK must recompute
        # attainment independently from the six raw score/max cells —
        # never trust this cell's value directly (same principle as the
        # Dashboard tab warning above, just at smaller scale).

    # Roster ends at this row; anything from here down is a class-level
    # summary, not a student, and must be excluded from extraction.
    SUMMARY_ROW_LABEL_COL = "B"
    SUMMARY_ROW_LABEL_PREFIX = "CLASS AVERAGE"


class IndirectCloSheet:
    """
    Layout of the 'Indirect CLO' tab.
    One repeating 2-column block per CLO: Rating (1-5 Likert), Attainment %.
    """
    HEADER_ROW = 4
    DATA_START_ROW = 5

    FIRST_BLOCK_START_COL = 3  # column C
    BLOCK_WIDTH = 2

    STUDENT_ID_COL = "A"
    STUDENT_NAME_COL = "B"

    class BlockOffsets:
        RATING = 0            # raw 1-5 Likert value
        ATTAINMENT_PCT = 1    # Excel formula = (Rating / 5) * 100; recompute independently

    # Two summary rows follow the roster — both must be excluded.
    SUMMARY_ROW_LABEL_COL = "A"
    SUMMARY_ROW_LABELS = (
        "MEAN RATING (of 5)",
        "%age CO ATTAINMENT (Indirect)",
    )


class CloDetection:
    """
    CLO count is NOT fixed, and this file does not validate it against
    anything. This sample workbook has 5 CLOs, but the template's own
    instructions say blocks are "repeatable — copy a CLO block to add more
    CLOs," and different courses legitimately have different CLO counts
    (the webapp's curriculum_map is where that's actually configured).

    Detection must scan the CLO label row (DirectCloSheet.CLO_LABEL_ROW /
    IndirectCloSheet.HEADER_ROW) at BLOCK_WIDTH stride until a blank cell is
    hit, and emit whatever CLO codes it finds — verbatim, no cross-check.
    If a course's Excel has CLO6 but the webapp only knows about CLO1–CLO5,
    that mismatch is surfaced downstream (backend), not here.
    """
    CLO_LABEL_PREFIX = "CLO"


class StudentRosterDetection:
    """
    Student count is NOT fixed either. Roster ends at the first row where:
      - STUDENT_ID_COL / STUDENT_NAME_COL are blank, OR
      - the row matches a known summary-row label (see above)
    Extraction must stop at whichever comes first, per sheet.
    """
    pass


# --- Transformation Constants (institution-wide; unchanged from v1) ---

class Transformation:
    INSTITUTIONAL_THRESHOLD = 0.70
    COMPLETENESS_THRESHOLD = 0.60
    CLO_LEVEL_EXCEPTIONAL_MIN = 0.85
    CLO_LEVEL_PROFICIENT_MIN = 0.70
    CLO_LEVEL_BASIC_MIN = 0.60
    FORMULA_VERSION_ID = "direct_attainment_v2_aunobe"
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
        EXCLUDED_REASON = "excluded_reason"
        IS_RECORD_COMPLETE = "is_record_complete"
        DIRECT_CLO_ATTAINMENT_PCT = "direct_clo_attainment_pct"
        INDIRECT_CLO_ATTAINMENT_PCT = "indirect_clo_attainment_pct"
        # ^ NEW vs v1 — the old template had no per-student indirect data at
        # this granularity (F12 was course-level tabulation only). This
        # template gives per-student Likert ratings, so composite (70/30)
        # can now be computed per-student, not just per-section.
        MET_THRESHOLD = "met_threshold"
        CLO_LEVEL = "clo_level"
        GROUP_RECORDS = "_group_records"
        SECTION_COMPLETENESS_PCT = "section_completeness_pct"
        RULE1_MET = "rule1_met"


# --- REMOVED from v1 — no longer applicable to this template ---
#
# SheetNames.DATABASE / .EXAM / .COVERPAGE / .OUTPUT
# GradingPeriod, AssessmentCategory, AssessmentNames
#   — this template has no per-assessment-item granularity (individual
#     quizzes/exams/outputs); scores arrive pre-summed into Prelim/Midterm/
#     Final subtotals per CLO. See flag #3 above re: CAR Part 2 impact.
# CoverPageLabels, HeaderData, DatabaseSheet, ExamSheet, OutputSheet,
# Roster (old), DATABASE_SHEET_COLUMNS, SheetVariables
#   — all tied to the old 3-sheet layout with per-assessment column ranges;
#     fully superseded by the block structure above.
# CloPlo
#   — retired on purpose, not just superseded. See "CLO-PLO MAPPING DECISION"
#     near the top of this file: mapping now lives solely in the webapp
#     (curriculum_map / CloToPloMapService), so python-server no longer reads,
#     validates, or reasons about CLO-PLO correlation in any form.

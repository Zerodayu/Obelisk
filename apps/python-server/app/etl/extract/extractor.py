import asyncio
import re
import warnings
from pathlib import Path
from typing import Any, List, Dict, Tuple
from openpyxl import load_workbook
from openpyxl.worksheet.worksheet import Worksheet
from openpyxl.utils.cell import column_index_from_string

from app.core.exceptions import InvalidTemplate, InvalidWorkbook, MissingWorksheet, UnsupportedCourseType
from app.core.logging import logger
from app.etl.abstracts import Extractor
from app.schemas.class_record import (
    ClassRecordHeader,
    RawScoreRecord,
    ExtractedSection,
    SetupMetadata,
    SectionExtractionStatus,
)
from app.schemas.extracted import StudentRawCloData

from .. import etl_const

SECTION_REGEX = re.compile(r"^\s*([A-Za-z]+)\s*-\s*(\d+)\s*([A-Za-z])\s*$")


class ExtractionResult(tuple):
    """
    Backwards-compatible 3-tuple (header, records, clo_plo_mapping) with
    attached section, section_extraction, and setup properties.
    """
    def __new__(
        cls,
        header: ClassRecordHeader,
        records: list[Any],
        clo_plo_mapping: list[dict[str, Any]],
        section: ExtractedSection | None = None,
        section_extraction: SectionExtractionStatus = "missing_sheet",
        setup: SetupMetadata | None = None,
    ):
        return super().__new__(cls, (header, records, clo_plo_mapping))

    def __init__(
        self,
        header: ClassRecordHeader,
        records: list[Any],
        clo_plo_mapping: list[dict[str, Any]],
        section: ExtractedSection | None = None,
        section_extraction: SectionExtractionStatus = "missing_sheet",
        setup: SetupMetadata | None = None,
    ):
        self.header = header
        self.records = records
        self.clo_plo_mapping = clo_plo_mapping
        self.section = section
        self.section_extraction = section_extraction
        self.setup = setup


class ExcelExtractor(Extractor):
    """
    Extracts data from the AUN-OBE JMCFI class-record Excel workbook (v2 layout).
    Reads 'Direct CLO' and 'Indirect CLO' sheets.
    CLO-PLO mapping is permanently retired and returns an empty list.
    """

    async def extract(self, source: Any) -> ExtractionResult:
        """
        Main entrypoint to extract all data from a given workbook source.
        """
        file_path = self._resolve_file_path(source)
        return await asyncio.to_thread(self._extract_sync, file_path)

    def _extract_sync(self, file_path: str) -> ExtractionResult:
        """Synchronous wrapper for all extraction operations."""
        try:
            with warnings.catch_warnings():
                # Suppress openpyxl's UserWarning regarding unsupported Data Validation extension
                warnings.filterwarnings("ignore", category=UserWarning, module="openpyxl")
                workbook = load_workbook(file_path, data_only=True)
        except Exception as exc:
            raise InvalidWorkbook(file_path=file_path, underlying_error=str(exc))

        # 1. Template Validation BEFORE any extraction
        # Must contain REQUIRED_SHEETS: 'Direct CLO' and 'Indirect CLO'
        for req_sheet in etl_const.TemplateValidation.REQUIRED_SHEETS:
            if req_sheet not in workbook.sheetnames:
                raise MissingWorksheet(expected_sheet_name=req_sheet, available_sheets=list(workbook.sheetnames))

        direct_sheet = workbook[etl_const.SheetNames.DIRECT_CLO]
        indirect_sheet = workbook[etl_const.SheetNames.INDIRECT_CLO]

        # Validate marker cells
        self._validate_sheet_marker(
            sheet=direct_sheet,
            cell=etl_const.TemplateValidation.DIRECT_CLO_MARKER_CELL,
            expected=etl_const.TemplateValidation.DIRECT_CLO_MARKER_VALUE,
        )
        self._validate_sheet_marker(
            sheet=indirect_sheet,
            cell=etl_const.TemplateValidation.INDIRECT_CLO_MARKER_CELL,
            expected=etl_const.TemplateValidation.INDIRECT_CLO_MARKER_VALUE,
        )

        # 2. Dynamic CLO block discovery
        direct_clos = self._discover_direct_clos(direct_sheet)
        indirect_clos = self._discover_indirect_clos(indirect_sheet)

        logger.info(
            "dynamic_clos_discovered",
            direct_clos=[c[1] for c in direct_clos],
            indirect_clos=[c[1] for c in indirect_clos],
        )

        # 3. Dynamic Student Roster discovery from Direct CLO sheet
        students = self._read_direct_roster(direct_sheet, start_row=etl_const.DirectCloSheet.DATA_START_ROW)

        # 4. Extract raw Direct CLO scores per student per CLO
        # Key: (student_id, student_name, clo_code)
        extracted_map: dict[tuple[str | None, str, str], StudentRawCloData] = {}

        for student in students:
            s_row = student["row"]
            s_id = student["student_id"]
            s_name = student["student_name"]

            for col_idx, clo_code in direct_clos:
                p_score = self._as_optional_float(direct_sheet.cell(row=s_row, column=col_idx + etl_const.DirectCloSheet.BlockOffsets.PRELIM_SCORE).value)
                p_max = self._as_optional_float(direct_sheet.cell(row=s_row, column=col_idx + etl_const.DirectCloSheet.BlockOffsets.PRELIM_MAX).value)
                m_score = self._as_optional_float(direct_sheet.cell(row=s_row, column=col_idx + etl_const.DirectCloSheet.BlockOffsets.MIDTERM_SCORE).value)
                m_max = self._as_optional_float(direct_sheet.cell(row=s_row, column=col_idx + etl_const.DirectCloSheet.BlockOffsets.MIDTERM_MAX).value)
                f_score = self._as_optional_float(direct_sheet.cell(row=s_row, column=col_idx + etl_const.DirectCloSheet.BlockOffsets.FINAL_SCORE).value)
                f_max = self._as_optional_float(direct_sheet.cell(row=s_row, column=col_idx + etl_const.DirectCloSheet.BlockOffsets.FINAL_MAX).value)

                extracted_map[(s_id, s_name, clo_code)] = StudentRawCloData(
                    student_id=s_id,
                    student_name=s_name,
                    clo_code=clo_code,
                    prelim_score=p_score,
                    prelim_max=p_max,
                    midterm_score=m_score,
                    midterm_max=m_max,
                    final_score=f_score,
                    final_max=f_max,
                    indirect_rating=None,
                )

        # 5. Extract raw Indirect CLO ratings per student per CLO
        indirect_students = self._read_indirect_roster(indirect_sheet, start_row=etl_const.IndirectCloSheet.DATA_START_ROW)
        indirect_students_by_id = {s["student_id"]: s for s in indirect_students if s["student_id"]}
        indirect_students_by_name = {self._normalize_name(s["student_name"]): s for s in indirect_students if s["student_name"]}

        for col_idx, clo_code in indirect_clos:
            for student in students:
                s_id = student["student_id"]
                s_name = student["student_name"]
                
                matched = indirect_students_by_id.get(s_id) or indirect_students_by_name.get(self._normalize_name(s_name))
                if matched:
                    rating = self._as_optional_float(indirect_sheet.cell(row=matched["row"], column=col_idx + etl_const.IndirectCloSheet.BlockOffsets.RATING).value)
                else:
                    rating = None

                key = (s_id, s_name, clo_code)
                if key in extracted_map:
                    extracted_map[key].indirect_rating = rating
                else:
                    extracted_map[key] = StudentRawCloData(
                        student_id=s_id,
                        student_name=s_name,
                        clo_code=clo_code,
                        indirect_rating=rating,
                    )

        records = list(extracted_map.values())

        # 6. Extract SETUP metadata and Section
        ws_setup = self._find_setup_sheet(workbook)
        section_info, section_extraction = self._extract_section(ws_setup)
        setup_metadata = self._extract_setup_metadata(ws_setup)

        header = self._build_header(
            workbook=workbook,
            num_students=len(students),
            ws_setup=ws_setup,
            section_info=section_info,
            section_extraction=section_extraction,
            setup_metadata=setup_metadata,
        )

        # CLO-PLO mapping is permanently retired
        clo_plo_mapping: list[dict[str, Any]] = []

        return ExtractionResult(
            header=header,
            records=records,
            clo_plo_mapping=clo_plo_mapping,
            section=section_info,
            section_extraction=section_extraction,
            setup=setup_metadata,
        )

    def _discover_direct_clos(self, sheet: Worksheet) -> list[tuple[int, str]]:
        """
        Discovers CLO blocks from the Direct CLO sheet dynamically.
        Scans row CLO_LABEL_ROW starting at FIRST_BLOCK_START_COL stepping by BLOCK_WIDTH
        until a blank cell is encountered.
        """
        col = etl_const.DirectCloSheet.FIRST_BLOCK_START_COL
        clos: list[tuple[int, str]] = []
        while col <= sheet.max_column:
            val = sheet.cell(row=etl_const.DirectCloSheet.CLO_LABEL_ROW, column=col).value
            if val is None or str(val).strip() == "":
                break
            clo_name = str(val).strip()
            clos.append((col, clo_name))
            col += etl_const.DirectCloSheet.BLOCK_WIDTH
        return clos

    def _discover_indirect_clos(self, sheet: Worksheet) -> list[tuple[int, str]]:
        """
        Discovers CLO blocks from the Indirect CLO sheet dynamically.
        Scans row HEADER_ROW starting at FIRST_BLOCK_START_COL stepping by BLOCK_WIDTH
        until a blank cell is encountered. Extracts CLO code from header (e.g. 'CLO1 Rating (1-5)' -> 'CLO1').
        """
        col = etl_const.IndirectCloSheet.FIRST_BLOCK_START_COL
        clos: list[tuple[int, str]] = []
        while col <= sheet.max_column:
            val = sheet.cell(row=etl_const.IndirectCloSheet.HEADER_ROW, column=col).value
            if val is None or str(val).strip() == "":
                break
            raw_text = str(val).strip()
            clo_code = raw_text.split()[0].strip() if raw_text else f"CLO{len(clos) + 1}"
            clos.append((col, clo_code))
            col += etl_const.IndirectCloSheet.BLOCK_WIDTH
        return clos

    def _read_direct_roster(self, sheet: Worksheet, start_row: int) -> list[dict[str, Any]]:
        """
        Reads student roster from Direct CLO sheet until a blank row or summary row label.
        """
        students: list[dict[str, Any]] = []
        id_col_idx = column_index_from_string(etl_const.DirectCloSheet.STUDENT_ID_COL)
        name_col_idx = column_index_from_string(etl_const.DirectCloSheet.STUDENT_NAME_COL)
        summary_col_idx = column_index_from_string(etl_const.DirectCloSheet.SUMMARY_ROW_LABEL_COL)
        prefix = etl_const.DirectCloSheet.SUMMARY_ROW_LABEL_PREFIX.upper()

        row = start_row
        while row <= sheet.max_row:
            id_val = sheet.cell(row=row, column=id_col_idx).value
            name_val = sheet.cell(row=row, column=name_col_idx).value
            summary_val = sheet.cell(row=row, column=summary_col_idx).value

            id_str = self._as_optional_string(id_val)
            name_str = self._as_optional_string(name_val)
            summary_str = self._as_optional_string(summary_val)

            # Check stop condition: blank row
            if not id_str and not name_str:
                break

            # Check stop condition: summary label
            if (summary_str and summary_str.upper().startswith(prefix)) or \
               (name_str and name_str.upper().startswith(prefix)) or \
               (id_str and id_str.upper().startswith(prefix)):
                break

            students.append({
                "student_id": id_str,
                "student_name": name_str or "",
                "row": row,
            })
            row += 1

        return students

    def _read_indirect_roster(self, sheet: Worksheet, start_row: int) -> list[dict[str, Any]]:
        """
        Reads student roster from Indirect CLO sheet until a blank row or summary row label.
        """
        students: list[dict[str, Any]] = []
        id_col_idx = column_index_from_string(etl_const.IndirectCloSheet.STUDENT_ID_COL)
        name_col_idx = column_index_from_string(etl_const.IndirectCloSheet.STUDENT_NAME_COL)
        summary_col_idx = column_index_from_string(etl_const.IndirectCloSheet.SUMMARY_ROW_LABEL_COL)
        summary_labels = [s.upper() for s in etl_const.IndirectCloSheet.SUMMARY_ROW_LABELS]

        row = start_row
        while row <= sheet.max_row:
            id_val = sheet.cell(row=row, column=id_col_idx).value
            name_val = sheet.cell(row=row, column=name_col_idx).value
            summary_val = sheet.cell(row=row, column=summary_col_idx).value

            id_str = self._as_optional_string(id_val)
            name_str = self._as_optional_string(name_val)
            summary_str = self._as_optional_string(summary_val)

            # Check stop condition: blank row
            if not id_str and not name_str:
                break

            # Check stop condition: summary label
            if any(lbl in (summary_str or "").upper() for lbl in summary_labels) or \
               any(lbl in (id_str or "").upper() for lbl in summary_labels):
                break

            students.append({
                "student_id": id_str,
                "student_name": name_str or "",
                "row": row,
            })
            row += 1

        return students

    def _validate_sheet_marker(self, sheet: Worksheet, cell: str, expected: str) -> None:
        """Validates that a sheet contains the expected marker value at cell."""
        raw_val = sheet[cell].value
        norm_val = self._normalize_text(raw_val)
        norm_exp = self._normalize_text(expected)
        if norm_val != norm_exp:
            raise InvalidTemplate(
                sheet_name=sheet.title,
                cell=cell,
                expected=expected,
                found=str(raw_val),
            )

    @staticmethod
    def _find_setup_sheet(workbook: Any) -> Worksheet | None:
        """Locates the SETUP worksheet by trimmed, case-insensitive name."""
        for name in workbook.sheetnames:
            if str(name).strip().upper() == "SETUP":
                return workbook[name]
        return None

    def _extract_section(self, ws_setup: Worksheet | None) -> tuple[ExtractedSection, SectionExtractionStatus]:
        """
        Locates the section label on SETUP sheet and parses the program & section code.
        - Check A4 first; if not 'Section' (case-insensitive, trimmed, ignoring a trailing colon),
          scan column A for that label.
        - Read value from the cell immediately to its right (column B, same row).
        - Format: <PROGRAM>-<YEAR><LETTER> with optional whitespace around the dash.
        - If missing sheet: section_extraction="missing_sheet", section fields null.
        - If missing label or value: section_extraction="missing_field", section fields null.
        - If value present but doesn't match format: section_extraction="unparseable", keep raw, section fields null.
        - If valid: section_extraction="ok", extract code, program, year_level, section_letter, raw.
        """
        if ws_setup is None:
            return (
                ExtractedSection(
                    code=None,
                    program=None,
                    year_level=None,
                    section_letter=None,
                    raw=None,
                ),
                "missing_sheet",
            )

        def _is_section_label(val: Any) -> bool:
            if val is None:
                return False
            cleaned = str(val).strip()
            if cleaned.endswith(":"):
                cleaned = cleaned[:-1].rstrip()
            return cleaned.upper() == "SECTION"

        section_row: int | None = None
        # Check A4 first
        if _is_section_label(ws_setup["A4"].value):
            section_row = 4
        else:
            # Scan column A
            for r in range(1, ws_setup.max_row + 1):
                if _is_section_label(ws_setup.cell(row=r, column=1).value):
                    section_row = r
                    break

        if section_row is None:
            return (
                ExtractedSection(
                    code=None,
                    program=None,
                    year_level=None,
                    section_letter=None,
                    raw=None,
                ),
                "missing_field",
            )

        raw_val = ws_setup.cell(row=section_row, column=2).value
        if raw_val is None or str(raw_val).strip() == "":
            return (
                ExtractedSection(
                    code=None,
                    program=None,
                    year_level=None,
                    section_letter=None,
                    raw=None,
                ),
                "missing_field",
            )

        raw_str = str(raw_val).strip()
        match = SECTION_REGEX.match(raw_str)
        if not match:
            return (
                ExtractedSection(
                    code=None,
                    program=None,
                    year_level=None,
                    section_letter=None,
                    raw=raw_str,
                ),
                "unparseable",
            )

        program_part = match.group(1).upper()
        year_part = int(match.group(2))
        letter_part = match.group(3).upper()
        code_part = f"{year_part}{letter_part}"

        return (
            ExtractedSection(
                code=code_part,
                program=program_part,
                year_level=year_part,
                section_letter=letter_part,
                raw=raw_str,
            ),
            "ok",
        )

    def _extract_setup_metadata(self, ws_setup: Worksheet | None) -> SetupMetadata:
        """
        Best-effort extraction of SETUP sheet fields: course_code, course_title, term, faculty_name, program.
        Returns null for anything missing and never lets a missing extra field fail the ETL.
        """
        if ws_setup is None:
            return SetupMetadata()

        def _clean_label(val: Any) -> str:
            if val is None:
                return ""
            text = str(val).strip()
            if text.endswith(":"):
                text = text[:-1].rstrip()
            return text.upper()

        def _find_field_value(default_label_coord: str, default_val_coord: str, target_labels: list[str]) -> str | None:
            try:
                # 1. Check default coordinate first
                if _clean_label(ws_setup[default_label_coord].value) in target_labels:
                    v = ws_setup[default_val_coord].value
                    if v is not None and str(v).strip():
                        return str(v).strip()

                # 2. Fallback scan across common header area
                max_r = min(30, ws_setup.max_row)
                max_c = min(10, ws_setup.max_column)
                for r in range(1, max_r + 1):
                    for c in range(1, max_c + 1):
                        if _clean_label(ws_setup.cell(row=r, column=c).value) in target_labels:
                            v = ws_setup.cell(row=r, column=c + 1).value
                            if v is not None and str(v).strip():
                                return str(v).strip()
            except Exception:
                pass
            return None

        course_title = _find_field_value("A3", "B3", ["COURSE TITLE", "SUBJECT TITLE", "TITLE"])
        course_code = _find_field_value("C3", "D3", ["COURSE CODE", "SUBJECT CODE", "CODE"])
        term = _find_field_value("C4", "D4", ["TERM / AY", "TERM/AY", "TERM", "SEMESTER / AY", "SEMESTER/AY", "SEMESTER", "TERM / ACADEMIC YEAR"])
        faculty_name = _find_field_value("A5", "B5", ["FACULTY NAME", "FACULTY", "INSTRUCTOR NAME", "INSTRUCTOR", "PROFESSOR", "TEACHER"])
        program = _find_field_value("C5", "D5", ["PROGRAM", "DEGREE PROGRAM", "DEGREE", "COURSE/PROGRAM"])

        return SetupMetadata(
            course_code=course_code,
            course_title=course_title,
            term=term,
            faculty_name=faculty_name,
            program=program,
        )

    def _build_header(
        self,
        workbook: Any,
        num_students: int,
        ws_setup: Worksheet | None = None,
        section_info: ExtractedSection | None = None,
        section_extraction: SectionExtractionStatus = "missing_sheet",
        setup_metadata: SetupMetadata | None = None,
    ) -> ClassRecordHeader:
        """
        Builds ClassRecordHeader from SETUP sheet if present, or defaults gracefully.
        Enforces course_type='LECTURE'.
        """
        if ws_setup is None:
            ws_setup = self._find_setup_sheet(workbook)

        course_code = None
        course_title = None
        course_type = "LECTURE"
        section = None
        semester_year = "Unknown"
        instructor_name = None
        threshold = etl_const.Transformation.INSTITUTIONAL_THRESHOLD
        grading_system = None

        if ws_setup is not None:
            course_title = (setup_metadata.course_title if setup_metadata else None) or self._as_optional_string(ws_setup["B3"].value)
            course_code = (setup_metadata.course_code if setup_metadata else None) or self._as_optional_string(ws_setup["D3"].value)
            section = (section_info.raw if section_info else None) or self._as_optional_string(ws_setup["B4"].value)
            sem = (setup_metadata.term if setup_metadata else None) or self._as_optional_string(ws_setup["D4"].value)
            if sem:
                semester_year = sem
            instructor_name = (setup_metadata.faculty_name if setup_metadata else None) or self._as_optional_string(ws_setup["B5"].value)

            # Check course type if specified in SETUP (e.g. B6)
            c_type = self._as_optional_string(ws_setup["B6"].value)
            if c_type:
                course_type = c_type.strip().upper()
                if course_type != "LECTURE":
                    raise UnsupportedCourseType(course_type=c_type, supported_types=["LECTURE"])

            thresh_val = self._as_optional_float(ws_setup["H9"].value) or self._as_optional_float(ws_setup["E9"].value)
            if thresh_val is not None:
                threshold = thresh_val / 100.0 if thresh_val > 1.0 else thresh_val

        header = ClassRecordHeader(
            course_code=course_code,
            course_title=course_title,
            course_type=course_type,
            section=section,
            semester_year=semester_year,
            instructor_name=instructor_name,
            no_of_students=num_students,
            threshold=threshold,
            grading_system=grading_system,
            workbook_configured_weights_unused=None,
        )
        header._section_data = section_info
        header._section_extraction = section_extraction
        header._setup_data = setup_metadata
        return header

    @staticmethod
    def _resolve_file_path(source: Any) -> str:
        """Finds a valid file path from various possible source types."""
        if isinstance(source, dict):
            path = source.get("file_path") or source.get("path")
            if path:
                return str(path)
        if hasattr(source, "file_path"):
            path = getattr(source, "file_path")
            if path:
                return str(path)
        if isinstance(source, (str, Path)):
            return str(source)
        raise InvalidWorkbook(file_path=str(source), underlying_error="Invalid source type")

    @staticmethod
    def _normalize_name(name: str) -> str:
        return " ".join(name.strip().lower().split())

    @staticmethod
    def _normalize_text(value: Any) -> str:
        if value is None:
            return ""
        return " ".join(str(value).strip().upper().split())

    @staticmethod
    def _as_optional_string(value: Any) -> str | None:
        if value is None:
            return None
        text = str(value).strip()
        return text if text else None

    @staticmethod
    def _as_optional_float(value: Any) -> float | None:
        if value is None:
            return None
        if isinstance(value, str):
            stripped = value.strip()
            if not stripped:
                return None
            value = stripped
        try:
            return float(value)
        except (TypeError, ValueError):
            return None

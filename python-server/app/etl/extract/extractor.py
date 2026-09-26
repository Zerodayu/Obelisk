import asyncio
import warnings
from pathlib import Path
from typing import Any, List, Dict, Tuple
from openpyxl import load_workbook
from openpyxl.worksheet.worksheet import Worksheet
from openpyxl.utils.cell import column_index_from_string

from app.core.exceptions import InvalidTemplate, InvalidWorkbook, MissingWorksheet, UnsupportedCourseType
from app.core.logging import logger
from app.etl.abstracts import Extractor
from app.schemas.class_record import ClassRecordHeader, RawScoreRecord
from app.schemas.extracted import StudentRawCloData

from .. import etl_const


class ExcelExtractor(Extractor):
    """
    Extracts data from the AUN-OBE JMCFI class-record Excel workbook (v2 layout).
    Reads 'Direct CLO' and 'Indirect CLO' sheets.
    CLO-PLO mapping is permanently retired and returns an empty list.
    """

    async def extract(self, source: Any) -> tuple[ClassRecordHeader, list[StudentRawCloData | RawScoreRecord], list[dict[str, Any]]]:
        """
        Main entrypoint to extract all data from a given workbook source.
        """
        file_path = self._resolve_file_path(source)
        return await asyncio.to_thread(self._extract_sync, file_path)

    def _extract_sync(self, file_path: str) -> tuple[ClassRecordHeader, list[StudentRawCloData], list[dict[str, Any]]]:
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

        # 6. Extract Header metadata
        header = self._build_header(workbook, num_students=len(students))

        # CLO-PLO mapping is permanently retired
        clo_plo_mapping: list[dict[str, Any]] = []

        return header, records, clo_plo_mapping

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

    def _build_header(self, workbook: Any, num_students: int) -> ClassRecordHeader:
        """
        Builds ClassRecordHeader from SETUP sheet if present, or defaults gracefully.
        Enforces course_type='LECTURE'.
        """
        course_code = None
        course_title = None
        course_type = "LECTURE"
        section = None
        semester_year = "Unknown"
        instructor_name = None
        threshold = etl_const.Transformation.INSTITUTIONAL_THRESHOLD
        grading_system = None

        if etl_const.SheetNames.SETUP in workbook.sheetnames:
            ws_setup = workbook[etl_const.SheetNames.SETUP]
            course_title = self._as_optional_string(ws_setup["B3"].value)
            course_code = self._as_optional_string(ws_setup["D3"].value)
            section = self._as_optional_string(ws_setup["B4"].value)
            sem = self._as_optional_string(ws_setup["D4"].value)
            if sem:
                semester_year = sem
            instructor_name = self._as_optional_string(ws_setup["B5"].value)
            
            # Check course type if specified in SETUP (e.g. B6)
            c_type = self._as_optional_string(ws_setup["B6"].value)
            if c_type:
                course_type = c_type.strip().upper()
                if course_type != "LECTURE":
                    raise UnsupportedCourseType(course_type=c_type, supported_types=["LECTURE"])

            thresh_val = self._as_optional_float(ws_setup["H9"].value) or self._as_optional_float(ws_setup["E9"].value)
            if thresh_val is not None:
                threshold = thresh_val / 100.0 if thresh_val > 1.0 else thresh_val

        return ClassRecordHeader(
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

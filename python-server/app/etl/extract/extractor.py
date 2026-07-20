import asyncio
from pathlib import Path
from typing import Any

from openpyxl import load_workbook
from openpyxl.utils.cell import column_index_from_string
from openpyxl.worksheet.worksheet import Worksheet

from app.core.exceptions import InvalidTemplate, InvalidWorkbook, MissingWorksheet
from app.etl.abstracts import Extractor
from app.schemas.class_record import ClassRecordHeader, RawScoreRecord


class ExcelExtractor(Extractor):
    async def extract(self, source: Any) -> tuple[ClassRecordHeader, list[RawScoreRecord]]:
        file_path = self._resolve_file_path(source)
        return await asyncio.to_thread(self._extract_sync, file_path)

    def _extract_sync(self, file_path: str) -> tuple[ClassRecordHeader, list[RawScoreRecord]]:
        try:
            workbook = load_workbook(file_path, data_only=True)
        except Exception as exc:
            raise InvalidWorkbook(f"Invalid workbook: {file_path}") from exc

        db_sheet = self._require_sheet(workbook, "Database (LECTURE-RES-PRAC)")
        exam_sheet = self._require_sheet(workbook, "Exam (LECTURE ONLY)")
        cover_sheet = self._require_sheet(workbook, "COVERPAGE")
        output_sheet = workbook["OUTPUT"] if "OUTPUT" in workbook.sheetnames else None

        self._validate_template(db_sheet, "B12")
        self._validate_template(exam_sheet, "B18")
        if output_sheet is not None:
            self._validate_template(output_sheet, "B18")

        header = self._build_header(db_sheet, cover_sheet)

        db_students = self._read_roster(db_sheet, start_row=17)
        records: list[RawScoreRecord] = []

        records.extend(
            self._extract_database_block(
                sheet=db_sheet,
                students=db_students,
                grading_period="PRELIM",
                columns=["D", "E", "F", "G", "H", "I", "J"],
            )
        )
        records.extend(
            self._extract_database_block(
                sheet=db_sheet,
                students=db_students,
                grading_period="MIDTERM",
                columns=["AJ", "AK", "AL", "AM", "AN", "AO", "AP", "AQ", "AR", "AS", "AT", "AU", "AV"],
            )
        )
        records.extend(
            self._extract_database_block(
                sheet=db_sheet,
                students=db_students,
                grading_period="FINAL",
                columns=["BP", "BQ", "BR", "BS", "BT", "BU", "BV", "BW", "BX", "BY", "BZ"],
            )
        )

        db_students_by_name = {
            self._normalize_name(student["student_name"]): student
            for student in db_students
            if student["student_name"]
        }
        records.extend(self._extract_exam_sheet(exam_sheet, db_students_by_name))

        if output_sheet is not None:
            records.extend(self._extract_output_sheet(output_sheet, db_students_by_name))

        return header, records

    @staticmethod
    def _resolve_file_path(source: Any) -> str:
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
        raise InvalidWorkbook("Invalid workbook source: missing file path")

    @staticmethod
    def _require_sheet(workbook: Any, sheet_name: str) -> Worksheet:
        if sheet_name not in workbook.sheetnames:
            raise MissingWorksheet(sheet_name)
        return workbook[sheet_name]

    def _validate_template(self, sheet: Worksheet, header_cell: str) -> None:
        header_value = self._normalize_text(sheet[header_cell].value)
        if header_value != "STUDENT NAME":
            raise InvalidTemplate(f"Invalid template header at {sheet.title}!{header_cell}")

    def _build_header(self, db_sheet: Worksheet, cover_sheet: Worksheet) -> ClassRecordHeader:
        semester_year = self._as_string(db_sheet["B3"].value)
        course_type = self._as_string(db_sheet["B6"].value)
        no_of_students = self._as_int(db_sheet["B8"].value)
        threshold = self._as_float(db_sheet["B10"].value)

        # The TLA/AT/EXAM weights are no longer used in the primary calculation,
        # but we can still extract them for diagnostic purposes.
        weights: dict[str, float] = {}
        d5 = self._as_string(db_sheet["D5"].value)
        if d5: weights[d5] = self._as_float(db_sheet["D6"].value)
        e5 = self._as_string(db_sheet["E5"].value)
        if e5: weights[e5] = self._as_float(db_sheet["E6"].value)
        f5 = self._as_string(db_sheet["F5"].value)
        if f5: weights[f5] = self._as_float(db_sheet["F6"].value)

        return ClassRecordHeader(
            course_code=self._coalesce_optional(
                db_sheet["B4"].value,
                self._find_cover_value(cover_sheet, "Course Code:"),
            ),
            course_title=self._coalesce_optional(
                db_sheet["B5"].value,
                self._find_cover_value(cover_sheet, "Course Title:"),
            ),
            course_type=course_type,
            section=self._coalesce_optional(
                db_sheet["B7"].value,
                self._find_cover_value(cover_sheet, "Section:"),
            ),
            semester_year=semester_year,
            instructor_name=self._coalesce_optional(
                db_sheet["B9"].value,
                self._find_cover_value(cover_sheet, "Instructor's Name"),
            ),
            no_of_students=no_of_students,
            threshold=threshold,
            grading_system=self._coalesce_optional(
                db_sheet["B11"].value,
                self._find_cover_value(cover_sheet, "GRADING SYSTEM"),
            ),
            workbook_configured_weights_unused=weights if weights else None,
        )

    def _read_roster(self, sheet: Worksheet, start_row: int) -> list[dict[str, str | int | None]]:
        students: list[dict[str, str | int | None]] = []
        row = start_row
        while True:
            student_id = self._as_optional_string(sheet[f"A{row}"].value)
            student_name = self._as_optional_string(sheet[f"B{row}"].value)
            if student_id is None and student_name is None:
                break
            if student_name:
                students.append({"student_id": student_id, "student_name": student_name, "row": row})
            row += 1
        return students

    def _extract_database_block(
        self,
        sheet: Worksheet,
        students: list[dict[str, str | int | None]],
        grading_period: str,
        columns: list[str],
    ) -> list[RawScoreRecord]:
        records: list[RawScoreRecord] = []
        for col in columns:
            max_score = self._as_optional_float(sheet[f"{col}16"].value)
            clo_code = self._as_optional_string(sheet[f"{col}14"].value)
            if max_score is None or clo_code is None:
                continue

            assessment_category = self._as_string(sheet[f"{col}12"].value)
            assessment_no = self._as_int(sheet[f"{col}13"].value)
            activity_name = self._as_optional_string(sheet[f"{col}15"].value)
            col_idx = column_index_from_string(col)

            for student in students:
                raw_score = self._as_optional_float(sheet.cell(row=student["row"], column=col_idx).value)
                records.append(
                    RawScoreRecord(
                        student_id=student["student_id"],
                        student_name=student["student_name"] or "",
                        grading_period=grading_period,
                        assessment_category=assessment_category,
                        assessment_no=assessment_no,
                        clo_code=clo_code,
                        activity_name=activity_name,
                        max_score=max_score,
                        raw_score=raw_score,
                    )
                )
        return records

    def _extract_exam_sheet(
        self, sheet: Worksheet, db_students_by_name: dict[str, dict[str, str | int | None]]
    ) -> list[RawScoreRecord]:
        exam_students = self._read_roster(sheet, start_row=22)
        student_lookup = self._merge_roster_by_name(exam_students, db_students_by_name)

        records: list[RawScoreRecord] = []
        records.extend(
            self._extract_exam_columns(
                sheet=sheet,
                students=student_lookup,
                grading_period="PRELIM",
                columns=["D"],
                activity_name="Prelim Exam",
            )
        )
        records.extend(
            self._extract_exam_columns(
                sheet=sheet,
                students=student_lookup,
                grading_period="MIDTERM",
                columns=["O", "P"],
                activity_name="Midterm Exam",
            )
        )
        records.extend(
            self._extract_exam_columns(
                sheet=sheet,
                students=student_lookup,
                grading_period="FINAL",
                columns=["Z", "AA", "AB"],
                activity_name="Final Exam",
            )
        )
        return records

    def _extract_exam_columns(
        self,
        sheet: Worksheet,
        students: list[dict[str, str | int | None]],
        grading_period: str,
        columns: list[str],
        activity_name: str,
    ) -> list[RawScoreRecord]:
        records: list[RawScoreRecord] = []
        for idx, col in enumerate(columns, start=1):
            max_score = self._as_optional_float(sheet[f"{col}21"].value)
            if max_score is None:
                continue
            clo_code = self._as_optional_string(sheet[f"{col}20"].value)
            if clo_code is None:
                continue
            col_idx = column_index_from_string(col)
            for student in students:
                raw_score = self._as_optional_float(sheet.cell(row=student["row"], column=col_idx).value)
                records.append(
                    RawScoreRecord(
                        student_id=student["student_id"],
                        student_name=student["student_name"] or "",
                        grading_period=grading_period,
                        assessment_category="EXAM",
                        assessment_no=idx,
                        clo_code=clo_code,
                        activity_name=activity_name,
                        max_score=max_score,
                        raw_score=raw_score,
                    )
                )
        return records

    def _extract_output_sheet(
        self, sheet: Worksheet, db_students_by_name: dict[str, dict[str, str | int | None]]
    ) -> list[RawScoreRecord]:
        output_students = self._read_roster(sheet, start_row=22)
        students = self._merge_roster_by_name(output_students, db_students_by_name)
        records: list[RawScoreRecord] = []

        period_columns = {
            "PRELIM": ["D", "E"],
            "MIDTERM": ["O"],
            "FINAL": ["Z"],
        }

        for period, columns in period_columns.items():
            assessment_no = 0
            for col in columns:
                max_score = self._as_optional_float(sheet[f"{col}21"].value)
                if max_score is None:
                    continue
                clo_code = self._as_optional_string(sheet[f"{col}20"].value)
                if clo_code is None:
                    continue
                assessment_no += 1
                activity_name = self._as_optional_string(sheet[f"{col}19"].value)
                col_idx = column_index_from_string(col)
                for student in students:
                    raw_score = self._as_optional_float(sheet.cell(row=student["row"], column=col_idx).value)
                    records.append(
                        RawScoreRecord(
                            student_id=student["student_id"],
                            student_name=student["student_name"] or "",
                            grading_period=period,
                            assessment_category="OUTPUT",
                            assessment_no=assessment_no,
                            clo_code=clo_code,
                            activity_name=activity_name,
                            max_score=max_score,
                            raw_score=raw_score,
                        )
                    )
        return records

    def _merge_roster_by_name(
        self,
        sheet_students: list[dict[str, str | int | None]],
        db_students_by_name: dict[str, dict[str, str | int | None]],
    ) -> list[dict[str, str | int | None]]:
        merged: list[dict[str, str | int | None]] = []
        for student in sheet_students:
            student_name = student.get("student_name")
            if not student_name:
                continue
            key = self._normalize_name(student_name)
            db_student = db_students_by_name.get(key)
            student_id = student.get("student_id") or (db_student.get("student_id") if db_student else None)
            merged.append({
                "student_id": student_id,
                "student_name": student_name,
                "row": student.get("row")
            })
        return merged

    def _find_cover_value(self, sheet: Worksheet, label: str) -> str | None:
        needle = self._normalize_label(label)
        for row in range(1, sheet.max_row + 1):
            for col in range(1, sheet.max_column + 1):
                value = sheet.cell(row=row, column=col).value
                if self._normalize_label(value) != needle:
                    continue
                next_value = self._as_optional_string(sheet.cell(row=row, column=col + 1).value)
                return next_value
        return None

    @staticmethod
    def _normalize_label(value: Any) -> str:
        if value is None:
            return ""
        normalized = str(value).strip().upper()
        if normalized.endswith(":"):
            normalized = normalized[:-1]
        return " ".join(normalized.split())

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

    def _as_string(self, value: Any) -> str:
        text = self._as_optional_string(value)
        return text or ""

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

    def _as_float(self, value: Any) -> float:
        parsed = self._as_optional_float(value)
        return parsed if parsed is not None else 0.0

    @staticmethod
    def _as_int(value: Any) -> int:
        if value is None:
            return 0
        if isinstance(value, str):
            stripped = value.strip()
            if not stripped:
                return 0
            value = stripped
        try:
            return int(float(value))
        except (TypeError, ValueError):
            return 0

    def _coalesce_optional(self, primary: Any, fallback: Any) -> str | None:
        return self._as_optional_string(primary) or self._as_optional_string(fallback)

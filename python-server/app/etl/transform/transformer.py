import hashlib
import json
from collections import defaultdict
from typing import Any, Literal, List, Dict, Set

from app.core.exceptions import TransformationError
from app.etl.abstracts import Transformer
from app.schemas.class_record import ClassRecordHeader, RawScoreRecord, StudentCLOAttainment
from app.schemas.extracted import StudentRawCloData
from .. import etl_const


class SimpleTransformer(Transformer):
    """
    Transforms extracted raw CLO data into a list of computed StudentCLOAttainment records,
    applying all institutional formulas, independent attainment recomputation,
    and data completeness checks.
    CLO-PLO mapping is permanently retired; excluded_reason is always None.
    """

    async def transform(self, extracted: Any) -> list[StudentCLOAttainment]:
        """
        Main entrypoint to transform extracted data into final attainment results.
        """
        if not (isinstance(extracted, tuple) and len(extracted) == 3 and isinstance(extracted[0], ClassRecordHeader) and isinstance(extracted[1], list)):
            raise TransformationError("transform expects (header, records, clo_plo_mapping)")

        header, records, _ = extracted

        # Normalize records: could be StudentRawCloData or legacy RawScoreRecord
        if records and isinstance(records[0], RawScoreRecord):
            return self._transform_legacy_records(header, records)

        return self._transform_v2_records(header, records)

    def _transform_v2_records(self, header: ClassRecordHeader, records: list[StudentRawCloData]) -> list[StudentCLOAttainment]:
        """Transform v2 StudentRawCloData records."""
        # 1. First pass: compute per-student, per-CLO attainment
        intermediate_results = []
        for record in records:
            # Rule 1 completeness check: Prelim, Midterm, and Final must all have non-null scores
            is_record_complete = (
                record.prelim_score is not None
                and record.midterm_score is not None
                and record.final_score is not None
            )

            # Recompute Direct CLO Attainment independently from raw cells: (sum_raw / sum_max)
            sum_raw = (record.prelim_score or 0.0) + (record.midterm_score or 0.0) + (record.final_score or 0.0)
            sum_max = (record.prelim_max or 0.0) + (record.midterm_max or 0.0) + (record.final_max or 0.0)
            
            if sum_max > 0:
                direct_clo_attainment_pct = sum_raw / sum_max
            else:
                direct_clo_attainment_pct = None

            # Recompute Indirect CLO Attainment independently from raw rating: (rating / 5) * 100
            if record.indirect_rating is not None:
                indirect_clo_attainment_pct = (record.indirect_rating / 5.0) * 100.0
            else:
                indirect_clo_attainment_pct = None

            met_threshold = (
                (direct_clo_attainment_pct >= etl_const.Transformation.INSTITUTIONAL_THRESHOLD)
                if direct_clo_attainment_pct is not None else None
            )
            clo_level = (
                self._compute_clo_level(direct_clo_attainment_pct)
                if direct_clo_attainment_pct is not None else None
            )

            intermediate_results.append({
                etl_const.Transformation.IntermediateKeys.STUDENT_ID: record.student_id,
                etl_const.Transformation.IntermediateKeys.STUDENT_NAME: record.student_name,
                etl_const.Transformation.IntermediateKeys.CLO_CODE: record.clo_code,
                etl_const.Transformation.IntermediateKeys.EXCLUDED_REASON: None,
                etl_const.Transformation.IntermediateKeys.IS_RECORD_COMPLETE: is_record_complete,
                etl_const.Transformation.IntermediateKeys.DIRECT_CLO_ATTAINMENT_PCT: direct_clo_attainment_pct,
                "indirect_clo_attainment_pct": indirect_clo_attainment_pct,
                etl_const.Transformation.IntermediateKeys.MET_THRESHOLD: met_threshold,
                etl_const.Transformation.IntermediateKeys.CLO_LEVEL: clo_level,
            })

        # 2. Second pass: Section completeness per CLO
        section_completeness_map = self._calculate_section_completeness(intermediate_results)

        # 3. Final pass: Assemble StudentCLOAttainment objects
        final_results: list[StudentCLOAttainment] = []
        for res in intermediate_results:
            clo_code = res[etl_const.Transformation.IntermediateKeys.CLO_CODE]
            completeness_info = section_completeness_map.get(clo_code, {
                etl_const.Transformation.IntermediateKeys.SECTION_COMPLETENESS_PCT: None,
                etl_const.Transformation.IntermediateKeys.RULE1_MET: None,
            })

            final_results.append(
                StudentCLOAttainment(
                    student_id=res[etl_const.Transformation.IntermediateKeys.STUDENT_ID],
                    student_name=res[etl_const.Transformation.IntermediateKeys.STUDENT_NAME],
                    clo_code=clo_code,
                    tla_pct=None,
                    at_pct=None,
                    exam_pct=None,
                    output_pct=None,
                    direct_clo_attainment_pct=res[etl_const.Transformation.IntermediateKeys.DIRECT_CLO_ATTAINMENT_PCT],
                    indirect_clo_attainment_pct=res["indirect_clo_attainment_pct"],
                    met_threshold=res[etl_const.Transformation.IntermediateKeys.MET_THRESHOLD],
                    clo_level=res[etl_const.Transformation.IntermediateKeys.CLO_LEVEL],
                    formula_version=self._formula_version(),
                    is_record_complete=res[etl_const.Transformation.IntermediateKeys.IS_RECORD_COMPLETE],
                    section_completeness_pct=completeness_info[etl_const.Transformation.IntermediateKeys.SECTION_COMPLETENESS_PCT],
                    rule1_met=completeness_info[etl_const.Transformation.IntermediateKeys.RULE1_MET],
                    excluded_reason=None,
                )
            )
        return final_results

    def _transform_legacy_records(self, header: ClassRecordHeader, records: list[RawScoreRecord]) -> list[StudentCLOAttainment]:
        """Support for legacy RawScoreRecord lists."""
        student_clo_groups: Dict[tuple, List[RawScoreRecord]] = defaultdict(list)
        for record in records:
            if record.raw_score is not None and record.raw_score > record.max_score:
                raise TransformationError(
                    message=f"raw_score exceeds max_score for student={record.student_name}, clo={record.clo_code}",
                    details={
                        etl_const.Transformation.IntermediateKeys.STUDENT_NAME: record.student_name,
                        etl_const.Transformation.IntermediateKeys.CLO_CODE: record.clo_code,
                        "raw_score": record.raw_score,
                        "max_score": record.max_score,
                    }
                )
            student_clo_groups[(record.student_name, record.student_id, record.clo_code)].append(record)

        intermediate_results = []
        for (student_name, student_id, clo_code), group_records in student_clo_groups.items():
            is_record_complete = self._check_record_completeness(group_records)
            direct_clo_attainment_pct = self._compute_direct_clo_attainment(group_records)
            intermediate_results.append({
                etl_const.Transformation.IntermediateKeys.STUDENT_ID: student_id,
                etl_const.Transformation.IntermediateKeys.STUDENT_NAME: student_name,
                etl_const.Transformation.IntermediateKeys.CLO_CODE: clo_code,
                etl_const.Transformation.IntermediateKeys.EXCLUDED_REASON: None,
                etl_const.Transformation.IntermediateKeys.IS_RECORD_COMPLETE: is_record_complete,
                etl_const.Transformation.IntermediateKeys.DIRECT_CLO_ATTAINMENT_PCT: direct_clo_attainment_pct,
                "indirect_clo_attainment_pct": None,
                etl_const.Transformation.IntermediateKeys.MET_THRESHOLD: direct_clo_attainment_pct >= etl_const.Transformation.INSTITUTIONAL_THRESHOLD if direct_clo_attainment_pct is not None else None,
                etl_const.Transformation.IntermediateKeys.CLO_LEVEL: self._compute_clo_level(direct_clo_attainment_pct) if direct_clo_attainment_pct is not None else None,
                etl_const.Transformation.IntermediateKeys.GROUP_RECORDS: group_records,
            })

        section_completeness_map = self._calculate_section_completeness(intermediate_results)

        final_results: list[StudentCLOAttainment] = []
        for res in intermediate_results:
            clo_code = res[etl_const.Transformation.IntermediateKeys.CLO_CODE]
            completeness_info = section_completeness_map.get(clo_code, {
                etl_const.Transformation.IntermediateKeys.SECTION_COMPLETENESS_PCT: None,
                etl_const.Transformation.IntermediateKeys.RULE1_MET: None,
            })
            group_records = res.get(etl_const.Transformation.IntermediateKeys.GROUP_RECORDS, [])
            final_results.append(
                StudentCLOAttainment(
                    student_id=res[etl_const.Transformation.IntermediateKeys.STUDENT_ID],
                    student_name=res[etl_const.Transformation.IntermediateKeys.STUDENT_NAME],
                    clo_code=clo_code,
                    tla_pct=self._category_pct(group_records, etl_const.AssessmentCategory.TLA) if hasattr(etl_const, "AssessmentCategory") else None,
                    at_pct=self._category_pct(group_records, etl_const.AssessmentCategory.AT) if hasattr(etl_const, "AssessmentCategory") else None,
                    exam_pct=self._category_pct(group_records, etl_const.AssessmentCategory.EXAM) if hasattr(etl_const, "AssessmentCategory") else None,
                    output_pct=self._category_pct(group_records, etl_const.AssessmentCategory.OUTPUT) if hasattr(etl_const, "AssessmentCategory") else None,
                    direct_clo_attainment_pct=res[etl_const.Transformation.IntermediateKeys.DIRECT_CLO_ATTAINMENT_PCT],
                    indirect_clo_attainment_pct=None,
                    met_threshold=res[etl_const.Transformation.IntermediateKeys.MET_THRESHOLD],
                    clo_level=res[etl_const.Transformation.IntermediateKeys.CLO_LEVEL],
                    formula_version=self._formula_version(),
                    is_record_complete=res[etl_const.Transformation.IntermediateKeys.IS_RECORD_COMPLETE],
                    section_completeness_pct=completeness_info[etl_const.Transformation.IntermediateKeys.SECTION_COMPLETENESS_PCT],
                    rule1_met=completeness_info[etl_const.Transformation.IntermediateKeys.RULE1_MET],
                    excluded_reason=None,
                )
            )
        return final_results

    def _calculate_section_completeness(self, intermediate_results: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
        """Calculate section-wide completeness for each CLO."""
        clo_groups: Dict[str, List[Dict]] = defaultdict(list)
        for res in intermediate_results:
            if res.get(etl_const.Transformation.IntermediateKeys.EXCLUDED_REASON):
                continue
            clo_groups[res[etl_const.Transformation.IntermediateKeys.CLO_CODE]].append(res)
        section_completeness_map = {}
        for clo_code, clo_student_records in clo_groups.items():
            complete_count = sum(1 for rec in clo_student_records if rec[etl_const.Transformation.IntermediateKeys.IS_RECORD_COMPLETE])
            total_students_for_clo = len(clo_student_records)
            section_completeness_pct = complete_count / total_students_for_clo if total_students_for_clo > 0 else 0.0
            section_completeness_map[clo_code] = {
                etl_const.Transformation.IntermediateKeys.SECTION_COMPLETENESS_PCT: section_completeness_pct,
                etl_const.Transformation.IntermediateKeys.RULE1_MET: section_completeness_pct >= etl_const.Transformation.COMPLETENESS_THRESHOLD,
            }
        return section_completeness_map

    @staticmethod
    def _check_record_completeness(records: List[RawScoreRecord]) -> bool:
        """
        Checks if a student has at least one non-null score in all three grading periods for a CLO.
        """
        present_periods: Set[str] = {r.grading_period for r in records if r.raw_score is not None}
        required_periods = {"PRELIM", "MIDTERM", "FINAL"}
        return required_periods.issubset(present_periods)

    @staticmethod
    def _category_pct(records: list[RawScoreRecord], category: str) -> float | None:
        eligible = [r for r in records if getattr(r, "assessment_category", None) == category and r.raw_score is not None]
        if not eligible:
            return None
        total_raw = sum(float(r.raw_score) for r in eligible if r.raw_score is not None)
        total_max = sum(r.max_score for r in eligible)
        if total_max <= 0:
            return None
        return total_raw / total_max

    @staticmethod
    def _compute_direct_clo_attainment(records: list[RawScoreRecord]) -> float:
        eligible_records = [r for r in records if r.raw_score is not None]
        if not eligible_records:
            return 0.0
        total_raw_score = sum(float(r.raw_score) for r in eligible_records if r.raw_score is not None)
        total_max_score = sum(r.max_score for r in eligible_records)
        if total_max_score == 0:
            return 0.0
        return total_raw_score / total_max_score

    @staticmethod
    def _compute_clo_level(direct_clo_attainment_pct: float) -> Literal["Exceptional", "Proficient", "Basic", "Below Basic"]:
        """
        Computes the 4-tier descriptive CLO level based on the attainment percentage.
        """
        if direct_clo_attainment_pct >= etl_const.Transformation.CLO_LEVEL_EXCEPTIONAL_MIN:
            return etl_const.Transformation.CloLevels.EXCEPTIONAL
        if direct_clo_attainment_pct >= etl_const.Transformation.CLO_LEVEL_PROFICIENT_MIN:
            return etl_const.Transformation.CloLevels.PROFICIENT
        if direct_clo_attainment_pct >= etl_const.Transformation.CLO_LEVEL_BASIC_MIN:
            return etl_const.Transformation.CloLevels.BASIC
        return etl_const.Transformation.CloLevels.BELOW_BASIC

    @staticmethod
    def _formula_version() -> str:
        """Generates a deterministic hash representing the formulas used in this transformation."""
        payload = {
            etl_const.Transformation.FormulaKeys.ID: etl_const.Transformation.FORMULA_VERSION_ID,
            etl_const.Transformation.FormulaKeys.INSTITUTIONAL_THRESHOLD: etl_const.Transformation.INSTITUTIONAL_THRESHOLD,
            etl_const.Transformation.FormulaKeys.COMPLETENESS_THRESHOLD: etl_const.Transformation.COMPLETENESS_THRESHOLD,
        }
        encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(encoded.encode("utf-8")).hexdigest()[:etl_const.Transformation.FORMULA_VERSION_HASH_LENGTH]

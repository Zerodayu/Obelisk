import hashlib
import json
from collections import defaultdict
from typing import Any, Literal, List, Dict, Set

from app.core.exceptions import TransformationError
from app.etl.abstracts import Transformer
from app.schemas.class_record import ClassRecordHeader, RawScoreRecord, StudentCLOAttainment
from .. import etl_const


class SimpleTransformer(Transformer):
    """
    Transforms raw extracted data into a list of computed StudentCLOAttainment records,
    applying all institutional formulas and data completeness checks.
    """

    async def transform(self, extracted: Any) -> list[StudentCLOAttainment]:
        """
        Main entrypoint to transform extracted data into final attainment results.
        """
        if not (isinstance(extracted, tuple) and len(extracted) == 3 and isinstance(extracted[0], ClassRecordHeader) and isinstance(extracted[1], list)):
            raise TransformationError("transform expects (header, records, clo_plo_mapping)")

        header, records, _ = extracted

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

        intermediate_results = self._calculate_student_attainment(student_clo_groups)
        section_completeness_map = self._calculate_section_completeness(intermediate_results)

        final_results = self._assemble_final_results(intermediate_results, section_completeness_map)

        return final_results

    def _calculate_student_attainment(self, student_clo_groups: Dict[tuple, List[RawScoreRecord]]) -> List[Dict[str, Any]]:
        """First pass: Calculate per-student, per-CLO attainment and completeness."""
        intermediate_results = []
        for (student_name, student_id, clo_code), group_records in student_clo_groups.items():
            is_record_complete = self._check_record_completeness(group_records)
            direct_clo_attainment_pct = self._compute_direct_clo_attainment(group_records)
            intermediate_results.append({
                etl_const.Transformation.IntermediateKeys.STUDENT_ID: student_id,
                etl_const.Transformation.IntermediateKeys.STUDENT_NAME: student_name,
                etl_const.Transformation.IntermediateKeys.CLO_CODE: clo_code,
                etl_const.Transformation.IntermediateKeys.IS_RECORD_COMPLETE: is_record_complete,
                etl_const.Transformation.IntermediateKeys.DIRECT_CLO_ATTAINMENT_PCT: direct_clo_attainment_pct,
                etl_const.Transformation.IntermediateKeys.MET_THRESHOLD: direct_clo_attainment_pct >= etl_const.Transformation.INSTITUTIONAL_THRESHOLD,
                etl_const.Transformation.IntermediateKeys.CLO_LEVEL: self._compute_clo_level(direct_clo_attainment_pct),
                etl_const.Transformation.IntermediateKeys.GROUP_RECORDS: group_records,
            })
        return intermediate_results

    def _calculate_section_completeness(self, intermediate_results: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
        """Second pass: Calculate section-wide completeness for each CLO."""
        clo_groups: Dict[str, List[Dict]] = defaultdict(list)
        for res in intermediate_results:
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

    def _assemble_final_results(self, intermediate_results: List[Dict[str, Any]], section_completeness_map: Dict[str, Dict[str, Any]]) -> List[StudentCLOAttainment]:
        """Final pass: Assemble all computed values into the final Pydantic models."""
        final_results: List[StudentCLOAttainment] = []
        for res in intermediate_results:
            clo_code = res[etl_const.Transformation.IntermediateKeys.CLO_CODE]
            completeness_info = section_completeness_map[clo_code]
            category_pcts = {
                etl_const.AssessmentCategory.TLA: self._category_pct(res[etl_const.Transformation.IntermediateKeys.GROUP_RECORDS], etl_const.AssessmentCategory.TLA),
                etl_const.AssessmentCategory.AT: self._category_pct(res[etl_const.Transformation.IntermediateKeys.GROUP_RECORDS], etl_const.AssessmentCategory.AT),
                etl_const.AssessmentCategory.EXAM: self._category_pct(res[etl_const.Transformation.IntermediateKeys.GROUP_RECORDS], etl_const.AssessmentCategory.EXAM),
                etl_const.AssessmentCategory.OUTPUT: self._category_pct(res[etl_const.Transformation.IntermediateKeys.GROUP_RECORDS], etl_const.AssessmentCategory.OUTPUT),
            }
            final_results.append(
                StudentCLOAttainment(
                    student_id=res[etl_const.Transformation.IntermediateKeys.STUDENT_ID],
                    student_name=res[etl_const.Transformation.IntermediateKeys.STUDENT_NAME],
                    clo_code=clo_code,
                    tla_pct=category_pcts[etl_const.AssessmentCategory.TLA],
                    at_pct=category_pcts[etl_const.AssessmentCategory.AT],
                    exam_pct=category_pcts[etl_const.AssessmentCategory.EXAM],
                    output_pct=category_pcts[etl_const.AssessmentCategory.OUTPUT],
                    direct_clo_attainment_pct=res[etl_const.Transformation.IntermediateKeys.DIRECT_CLO_ATTAINMENT_PCT],
                    met_threshold=res[etl_const.Transformation.IntermediateKeys.MET_THRESHOLD],
                    clo_level=res[etl_const.Transformation.IntermediateKeys.CLO_LEVEL],
                    formula_version=self._formula_version(),
                    is_record_complete=res[etl_const.Transformation.IntermediateKeys.IS_RECORD_COMPLETE],
                    section_completeness_pct=completeness_info[etl_const.Transformation.IntermediateKeys.SECTION_COMPLETENESS_PCT],
                    rule1_met=completeness_info[etl_const.Transformation.IntermediateKeys.RULE1_MET],
                )
            )
        return final_results

    @staticmethod
    def _check_record_completeness(records: List[RawScoreRecord]) -> bool:
        """
        Checks if a student has at least one non-null score in all three grading periods for a CLO.
        Implements Rule 1 from the WIN-OBE Assessment Plan, §3.6.
        """
        present_periods: Set[str] = {r.grading_period for r in records if r.raw_score is not None}
        required_periods = {
            etl_const.GradingPeriod.PRELIM,
            etl_const.GradingPeriod.MIDTERM,
            etl_const.GradingPeriod.FINAL
        }
        return required_periods.issubset(present_periods)

    @staticmethod
    def _category_pct(records: list[RawScoreRecord], category: str) -> float | None:
        """Computes the percentage for a single assessment category (for informational purposes only)."""
        eligible = [r for r in records if r.assessment_category == category and r.raw_score is not None]
        if not eligible: return None
        total_raw = sum(float(r.raw_score) for r in eligible if r.raw_score is not None)
        total_max = sum(r.max_score for r in eligible)
        if total_max <= 0: return None
        return total_raw / total_max

    @staticmethod
    def _compute_direct_clo_attainment(records: list[RawScoreRecord]) -> float:
        """
        Computes Direct CLO Attainment per Formula 1A from the WIN-OBE Assessment Plan, §3.5.1.
        """
        eligible_records = [r for r in records if r.raw_score is not None]
        if not eligible_records: return 0.0
        total_raw_score = sum(float(r.raw_score) for r in eligible_records if r.raw_score is not None)
        total_max_score = sum(r.max_score for r in eligible_records)
        if total_max_score == 0: return 0.0
        return total_raw_score / total_max_score

    @staticmethod
    def _compute_clo_level(direct_clo_attainment_pct: float) -> Literal["Exceptional", "Proficient", "Basic", "Below Basic"]:
        """
        Computes the 4-tier descriptive CLO level based on the attainment percentage.
        Source: WIN-OBE Assessment Plan, §3.1.1.
        """
        if direct_clo_attainment_pct >= etl_const.Transformation.CLO_LEVEL_EXCEPTIONAL_MIN: return etl_const.Transformation.CloLevels.EXCEPTIONAL
        if direct_clo_attainment_pct >= etl_const.Transformation.CLO_LEVEL_PROFICIENT_MIN: return etl_const.Transformation.CloLevels.PROFICIENT
        if direct_clo_attainment_pct >= etl_const.Transformation.CLO_LEVEL_BASIC_MIN: return etl_const.Transformation.CloLevels.BASIC
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
import hashlib
import json
from collections import defaultdict
from typing import Any, Literal, List, Dict, Set

from app.core.exceptions import TransformationError
from app.etl.abstracts import Transformer
from app.schemas.class_record import ClassRecordHeader, RawScoreRecord, StudentCLOAttainment

# The institutional threshold is fixed at 70% as per FR-03, FR-12, and FR-20.
INSTITUTIONAL_THRESHOLD = 0.70
COMPLETENESS_THRESHOLD = 0.60


class SimpleTransformer(Transformer):
    """
    Transforms raw extracted data into a list of computed StudentCLOAttainment records,
    applying all institutional formulas and data completeness checks.
    """

    async def transform(self, extracted: Any) -> list[StudentCLOAttainment]:
        """
        Main entrypoint to transform extracted data into final attainment results.

        Args:
            extracted: A tuple containing the header, raw score records, and CLO-PLO mapping.

        Returns:
            A list of StudentCLOAttainment objects with all calculations performed.
        """
        if not (isinstance(extracted, tuple) and len(extracted) == 3 and isinstance(extracted[0], ClassRecordHeader) and isinstance(extracted[1], list)):
            raise TransformationError("transform expects (header, records, clo_plo_mapping)")

        header, records, _ = extracted  # clo_plo_mapping is passed through but not used here

        student_clo_groups: Dict[tuple, List[RawScoreRecord]] = defaultdict(list)
        for record in records:
            if record.raw_score is not None and record.raw_score > record.max_score:
                raise TransformationError(f"raw_score exceeds max_score for student={record.student_name}, clo={record.clo_code}")
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
                "student_id": student_id,
                "student_name": student_name,
                "clo_code": clo_code,
                "is_record_complete": is_record_complete,
                "direct_clo_attainment_pct": direct_clo_attainment_pct,
                "met_threshold": direct_clo_attainment_pct >= INSTITUTIONAL_THRESHOLD,
                "clo_level": self._compute_clo_level(direct_clo_attainment_pct),
                "_group_records": group_records,
            })
        return intermediate_results

    def _calculate_section_completeness(self, intermediate_results: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
        """Second pass: Calculate section-wide completeness for each CLO."""
        clo_groups: Dict[str, List[Dict]] = defaultdict(list)
        for res in intermediate_results:
            clo_groups[res["clo_code"]].append(res)

        section_completeness_map = {}
        for clo_code, clo_student_records in clo_groups.items():
            complete_count = sum(1 for rec in clo_student_records if rec["is_record_complete"])
            total_students_for_clo = len(clo_student_records)
            section_completeness_pct = complete_count / total_students_for_clo if total_students_for_clo > 0 else 0.0
            section_completeness_map[clo_code] = {
                "section_completeness_pct": section_completeness_pct,
                "rule1_met": section_completeness_pct >= COMPLETENESS_THRESHOLD,
            }
        return section_completeness_map

    def _assemble_final_results(self, intermediate_results: List[Dict[str, Any]], section_completeness_map: Dict[str, Dict[str, Any]]) -> List[StudentCLOAttainment]:
        """Final pass: Assemble all computed values into the final Pydantic models."""
        final_results: List[StudentCLOAttainment] = []
        for res in intermediate_results:
            clo_code = res["clo_code"]
            completeness_info = section_completeness_map[clo_code]

            category_pcts = {
                "TLA": self._category_pct(res["_group_records"], "TLA"),
                "AT": self._category_pct(res["_group_records"], "AT"),
                "EXAM": self._category_pct(res["_group_records"], "EXAM"),
                "OUTPUT": self._category_pct(res["_group_records"], "OUTPUT"),
            }

            final_results.append(
                StudentCLOAttainment(
                    student_id=res["student_id"],
                    student_name=res["student_name"],
                    clo_code=clo_code,
                    tla_pct=category_pcts["TLA"],
                    at_pct=category_pcts["AT"],
                    exam_pct=category_pcts["EXAM"],
                    output_pct=category_pcts["OUTPUT"],
                    direct_clo_attainment_pct=res["direct_clo_attainment_pct"],
                    met_threshold=res["met_threshold"],
                    clo_level=res["clo_level"],
                    formula_version=self._formula_version(),
                    is_record_complete=res["is_record_complete"],
                    section_completeness_pct=completeness_info["section_completeness_pct"],
                    rule1_met=completeness_info["rule1_met"],
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
        return {"PRELIM", "MIDTERM", "FINAL"}.issubset(present_periods)

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
        This is the sum of raw scores divided by the sum of max scores for all assessments mapped to the CLO.
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
        Source: WIN-OBE Assessment Plan, §3.5.1.
        """
        if direct_clo_attainment_pct >= 0.85: return "Exceptional"
        if direct_clo_attainment_pct >= 0.70: return "Proficient"
        if direct_clo_attainment_pct >= 0.60: return "Basic"
        return "Below Basic"

    @staticmethod
    def _formula_version() -> str:
        """Generates a deterministic hash representing the formulas used in this transformation."""
        payload = {
            "formula": "direct_attainment_v1",
            "institutional_threshold": INSTITUTIONAL_THRESHOLD,
            "completeness_threshold": COMPLETENESS_THRESHOLD,
        }
        encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(encoded.encode("utf-8")).hexdigest()[:12]

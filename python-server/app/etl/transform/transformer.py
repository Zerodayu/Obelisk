import hashlib
import json
from collections import defaultdict
from typing import Any, Literal

from app.core.exceptions import TransformationError
from app.etl.abstracts import Transformer
from app.schemas.class_record import ClassRecordHeader, RawScoreRecord, StudentCLOAttainment

# The institutional threshold is fixed at 70% as per FR-03, FR-12, and FR-20.
INSTITUTIONAL_THRESHOLD = 0.70


class SimpleTransformer(Transformer):
    async def transform(
        self,
        extracted: Any,
    ) -> list[StudentCLOAttainment]:
        if (
            isinstance(extracted, tuple)
            and len(extracted) == 2
            and isinstance(extracted[0], ClassRecordHeader)
            and isinstance(extracted[1], list)
        ):
            header, records = extracted
        else:
            raise TransformationError("transform expects (header, records)")

        grouped: dict[tuple[str, str | None, str], list[RawScoreRecord]] = defaultdict(list)
        for record in records:
            if record.raw_score is not None and record.raw_score > record.max_score:
                raise TransformationError(
                    f"raw_score exceeds max_score for student={record.student_name}, clo={record.clo_code}"
                )
            key = (record.student_name, record.student_id, record.clo_code)
            grouped[key].append(record)

        results: list[StudentCLOAttainment] = []
        for (student_name, student_id, clo_code), group_records in grouped.items():
            # Keep category percentages for informational breakdown, but they are not used in the main calculation.
            category_pcts: dict[str, float | None] = {
                "TLA": self._category_pct(group_records, "TLA"),
                "AT": self._category_pct(group_records, "AT"),
                "EXAM": self._category_pct(group_records, "EXAM"),
                "OUTPUT": self._category_pct(group_records, "OUTPUT"),
            }

            direct_clo_attainment_pct = self._compute_direct_clo_attainment(group_records)
            
            # The `met_threshold` check now uses the fixed institutional threshold.
            met_threshold = direct_clo_attainment_pct >= INSTITUTIONAL_THRESHOLD
            
            clo_level = self._compute_clo_level(direct_clo_attainment_pct)

            results.append(
                StudentCLOAttainment(
                    student_id=student_id,
                    student_name=student_name,
                    clo_code=clo_code,
                    tla_pct=category_pcts["TLA"],
                    at_pct=category_pcts["AT"],
                    exam_pct=category_pcts["EXAM"],
                    output_pct=category_pcts["OUTPUT"],
                    direct_clo_attainment_pct=direct_clo_attainment_pct,
                    met_threshold=met_threshold,
                    clo_level=clo_level,
                    formula_version=self._formula_version(),
                )
            )

        return results

    @staticmethod
    def _category_pct(records: list[RawScoreRecord], category: str) -> float | None:
        """Computes the percentage for a single assessment category (for informational purposes only)."""
        eligible = [r for r in records if r.assessment_category == category and r.raw_score is not None]
        if not eligible:
            return None
        total_raw = sum(float(r.raw_score) for r in eligible if r.raw_score is not None)
        total_max = sum(r.max_score for r in eligible)
        if total_max <= 0:
            return None
        return total_raw / total_max

    @staticmethod
    def _compute_direct_clo_attainment(records: list[RawScoreRecord]) -> float:
        """
        Computes Direct CLO Attainment per Manual Formula 1A.
        (Sum of raw scores) / (Sum of max scores) for all assessments mapped to the CLO.
        """
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
        if direct_clo_attainment_pct >= 0.85:
            return "Exceptional"
        if direct_clo_attainment_pct >= 0.70:
            return "Proficient"
        if direct_clo_attainment_pct >= 0.60:
            return "Basic"
        return "Below Basic"

    @staticmethod
    def _formula_version() -> str:
        """
        Generates a deterministic hash representing the formula used.
        Since weights are removed, this is now a constant for Formula 1A.
        """
        payload = {
            "formula": "direct_attainment_v1",
            "institutional_threshold": INSTITUTIONAL_THRESHOLD,
        }
        encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(encoded.encode("utf-8")).hexdigest()[:12]

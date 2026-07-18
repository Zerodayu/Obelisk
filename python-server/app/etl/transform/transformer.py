import hashlib
import json
from collections import defaultdict
from typing import Any, Literal, cast

from app.core.exceptions import TransformationError
from app.etl.abstracts import Transformer
from app.schemas.class_record import ClassRecordHeader, RawScoreRecord, StudentCLOAttainment


class SimpleTransformer(Transformer):
    async def transform(
        self,
        header: Any,
        records: list[RawScoreRecord] | None = None,
    ) -> list[StudentCLOAttainment]:
        if records is None:
            if (
                isinstance(header, tuple)
                and len(header) == 2
                and isinstance(header[0], ClassRecordHeader)
                and isinstance(header[1], list)
            ):
                header, records = header
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
            category_pcts: dict[str, float | None] = {
                "TLA": self._category_pct(group_records, "TLA"),
                "AT": self._category_pct(group_records, "AT"),
                "EXAM": self._category_pct(group_records, "EXAM"),
                "OUTPUT": self._category_pct(group_records, "OUTPUT"),
            }

            clo_attainment_pct = self._compute_clo_attainment_pct(
                category_pcts=category_pcts,
                weights=header.tla_at_exam_weights,
                student_name=student_name,
                clo_code=clo_code,
            )
            met_threshold = clo_attainment_pct >= header.threshold
            clo_level = self._compute_clo_level(clo_attainment_pct, header.threshold)

            results.append(
                StudentCLOAttainment(
                    student_id=student_id,
                    student_name=student_name,
                    clo_code=clo_code,
                    tla_pct=category_pcts["TLA"],
                    at_pct=category_pcts["AT"],
                    exam_pct=category_pcts["EXAM"],
                    output_pct=category_pcts["OUTPUT"],
                    clo_attainment_pct=clo_attainment_pct,
                    met_threshold=met_threshold,
                    clo_level=cast(Literal[1, 2, 3], clo_level),
                    formula_version=self._formula_version(header.tla_at_exam_weights, header.threshold),
                )
            )

        return results

    @staticmethod
    def _category_pct(records: list[RawScoreRecord], category: str) -> float | None:
        eligible = [r for r in records if r.assessment_category == category and r.raw_score is not None]
        if not eligible:
            return None
        total_raw = sum(float(r.raw_score) for r in eligible if r.raw_score is not None)
        total_max = sum(r.max_score for r in eligible)
        if total_max <= 0:
            return None
        return total_raw / total_max

    def _compute_clo_attainment_pct(
        self,
        category_pcts: dict[str, float | None],
        weights: dict[str, float],
        student_name: str,
        clo_code: str,
    ) -> float:
        categories = ["TLA", "AT", "EXAM", "OUTPUT"]
        resolved_weights: dict[str, float] = {}
        for category in categories:
            if category in weights:
                resolved_weights[category] = weights[category]
                continue

            if category == "OUTPUT":
                # OUTPUT weight is optional in current templates; default to 0 so lecture-only files still transform.
                resolved_weights[category] = 0.0
            elif category_pcts[category] is not None:
                raise TransformationError(
                    f"missing weight for category={category}, student={student_name}, clo={clo_code}"
                )
            else:
                resolved_weights[category] = 0.0

        present_categories = [c for c in categories if category_pcts[c] is not None]
        present_weight_sum = sum(resolved_weights[c] for c in present_categories)
        if present_weight_sum <= 0:
            raise TransformationError(
                f"no usable weights for student={student_name}, clo={clo_code}"
            )

        # Renormalization: when a category pct is None for this CLO, remove it and re-scale remaining weights to sum to 1.0.
        normalized_weights = {
            category: (resolved_weights[category] / present_weight_sum)
            for category in present_categories
        }
        return sum((category_pcts[c] or 0.0) * normalized_weights[c] for c in present_categories)

    @staticmethod
    def _compute_clo_level(clo_attainment_pct: float, threshold: float) -> int:
        if clo_attainment_pct < 0.5:
            return 1
        if clo_attainment_pct < threshold:
            return 2
        return 3

    @staticmethod
    def _formula_version(weights: dict[str, float], threshold: float) -> str:
        payload = {
            "threshold": threshold,
            "weights": {key: weights[key] for key in sorted(weights.keys())},
        }
        encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(encoded.encode("utf-8")).hexdigest()[:12]


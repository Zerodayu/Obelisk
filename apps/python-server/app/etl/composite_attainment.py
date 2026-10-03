"""
Pure OBE calculation functions for composite CLO attainment.

Institutional specification:
- Direct CLO Attainment is provided as a fraction (0.0 - 1.0) and converted to a percentage (0.0 - 100.0).
- Indirect CLO Attainment is already on the 0.0 - 100.0 scale.
- Composite Attainment Formula:
    composite = 0.70 * direct_pct + 0.30 * indirect_pct
- Fallback Rule:
    If indirect_pct is None (e.g. no survey sheet or blank student rating), composite = direct_pct.
    If indirect_pct is 0.0 (or any number), it is a real score and NOT treated as missing.
- Result is rounded to 2 decimal places before threshold and performance level classification.
"""

from typing import Literal
from app.etl import etl_const
from app.core.logging import logger


def compute_composite_clo(
    direct_fraction: float | None,
    indirect_pct: float | None,
    strict_scale: bool = False,
) -> float | None:
    """
    Computes the 70/30 composite CLO attainment on a 0-100 percentage scale.

    Inputs:
      direct_fraction: Direct attainment as a fraction in [0.0, 1.0] (or None).
      indirect_pct: Indirect attainment as a percentage in [0.0, 100.0] (or None).
      strict_scale: If True, raises ValueError when direct_fraction > 1.0. If False, logs a warning.

    Returns:
      Composite percentage rounded to 2 decimal places in [0.0, 100.0], or None if direct is None.
    """
    if direct_fraction is None:
        return None

    if direct_fraction < 0.0:
        raise ValueError(
            f"direct_fraction must be non-negative, got: {direct_fraction}"
        )
    if direct_fraction > 1.0:
        if strict_scale:
            raise ValueError(
                f"direct_fraction must be between 0.0 and 1.0, got: {direct_fraction}"
            )
        # Extra credit / bonus points or raw score exceeding max in input sheet
        logger.warning("direct_fraction_exceeds_one", direct_fraction=direct_fraction)

    direct_pct = direct_fraction * 100.0

    if indirect_pct is not None:
        if indirect_pct < 0.0 or indirect_pct > 100.0:
            raise ValueError(
                f"indirect_pct must be between 0.0 and 100.0, got: {indirect_pct}"
            )
        composite = (
            etl_const.Transformation.DIRECT_WEIGHT * direct_pct
            + etl_const.Transformation.INDIRECT_WEIGHT * indirect_pct
        )
    else:
        # Fallback rule: no indirect evidence available -> composite = direct
        composite = direct_pct

    return round(composite, 2)


def compute_clo_level(
    composite_pct: float,
) -> Literal["Exceptional", "Proficient", "Basic", "Below Basic"]:
    """
    Computes the 4-tier descriptive CLO level based on composite percentage (0-100 scale).
    Exceptional: >= 85.0
    Proficient:  >= 70.0
    Basic:       >= 60.0
    Below Basic: <  60.0
    """
    if composite_pct >= etl_const.Transformation.CLO_LEVEL_EXCEPTIONAL_MIN:
        return etl_const.Transformation.CloLevels.EXCEPTIONAL
    if composite_pct >= etl_const.Transformation.CLO_LEVEL_PROFICIENT_MIN:
        return etl_const.Transformation.CloLevels.PROFICIENT
    if composite_pct >= etl_const.Transformation.CLO_LEVEL_BASIC_MIN:
        return etl_const.Transformation.CloLevels.BASIC
    return etl_const.Transformation.CloLevels.BELOW_BASIC

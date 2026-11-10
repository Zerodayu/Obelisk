"""
Constants for CQI report narrative generation and validation.
Root-cause categories must be kept strictly in sync with the backend validators:
`apps/backend/lib/validators/root-cause.ts`.
"""

from typing import Final, Tuple

# Canonical root-cause categories matching backend ROOT_CAUSE_CATEGORIES
ROOT_CAUSE_CATEGORIES: Final[Tuple[str, ...]] = (
    "1-Curriculum Design",
    "2-Instruction & Pedagogy",
    "3-Assessment Design",
    "4-Student Factors",
    "5-Resources & Tools",
    "6-Industry & Field Alignment",
)

# Allowed responsible roles for recommendations
ALLOWED_RESPONSIBLE_ROLES: Final[Tuple[str, ...]] = (
    "Faculty",
    "Program Chair",
    "Dean",
    "VPAA",
    "AQAU",
)

# Allowed loop statuses from webapp CQI
ALLOWED_LOOP_STATUSES: Final[Tuple[str, ...]] = (
    "CLOSED",
    "OPEN_REASSESS",
    "OPEN_NOT_IMPLEMENTED",
)

# Allowed attainment statuses
ALLOWED_ATTAINMENT_STATUSES: Final[Tuple[str, ...]] = (
    "MET",
    "NOT MET",
)

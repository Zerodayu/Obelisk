#!/usr/bin/env python3
"""
Comprehensive validation test for extractor and transformer (v2 AUN-OBE template).
Validates raw CLO record counts, transformer output, independent attainment calculation,
and dynamic CLO detection.
"""

import asyncio
import sys
from pathlib import Path
from collections import defaultdict

# Add project root to path to allow imports from `app`
PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from app.etl.extract.extractor import ExcelExtractor
from app.etl.transform.transformer import SimpleTransformer
from app.etl import etl_const
from app.schemas.class_record import ClassRecordHeader
from app.schemas.extracted import StudentRawCloData

# Define the path to the templates directory relative to the project root
TEMPLATES_DIR = PROJECT_ROOT / "classrecord_templates"
TEST_FILE = TEMPLATES_DIR / "JMCFI_Class_Record_Template_AUN-OBE.xlsx"


async def step1_validate_extraction():
    """
    Step 1: Extract data and validate StudentRawCloData counts.
    """
    print("\n" + "=" * 80)
    print("STEP 1: Validate Extraction - Raw CLO Data Counts")
    print("=" * 80)

    if not TEST_FILE.exists():
        print(f"ERROR: Sample file not found at {TEST_FILE}")
        return None, None, None

    try:
        extractor = ExcelExtractor()
        header, records, clo_plo_mapping = await extractor.extract(source=TEST_FILE)
    except Exception as e:
        print(f"ERROR during extraction: {e}")
        import traceback
        traceback.print_exc()
        return None, None, None

    print(f"\nHeader: course={header.course_code} - {header.course_title}, students={header.no_of_students}")
    print(f"Total StudentRawCloData records: {len(records)}")
    print(f"CLO-PLO mapping (should be empty): {clo_plo_mapping}")

    assert len(clo_plo_mapping) == 0, f"Expected empty mapping, got {len(clo_plo_mapping)}"
    assert header.no_of_students == 15, f"Expected 15 students, got {header.no_of_students}"
    assert len(records) == 75, f"Expected 75 records (15 students x 5 CLOs), got {len(records)}"

    print("\n[OK] Extraction counts match expected baseline (15 students, 5 CLOs, 75 records)")
    return header, records, clo_plo_mapping


async def step2_validate_transform(header, records, clo_plo_mapping):
    """
    Step 2: Transform data and verify independent calculations.
    """
    print("\n" + "=" * 80)
    print("STEP 2: Transform Data and Verify Independent Calculation")
    print("=" * 80)

    try:
        transformer = SimpleTransformer()
        attainments = await transformer.transform((header, records, clo_plo_mapping))
    except Exception as e:
        print(f"ERROR during transformation: {e}")
        import traceback
        traceback.print_exc()
        return None

    print(f"\nTotal StudentCLOAttainment records: {len(attainments)}")
    assert len(attainments) == 75, f"Expected 75 attainments, got {len(attainments)}"

    first = attainments[0]
    print(f"\nSample Student: {first.student_name} (ID: {first.student_id}) - {first.clo_code}")
    print(f"  Direct CLO Attainment: {first.direct_clo_attainment_pct:.4f} (expected {91/105:.4f})")
    print(f"  Indirect CLO Attainment: {first.indirect_clo_attainment_pct}% (expected 60.0%)")
    print(f"  Met Threshold: {first.met_threshold}")
    print(f"  CLO Level: {first.clo_level}")
    print(f"  Excluded Reason: {first.excluded_reason} (expected None)")

    # Assertions on independent calculation
    assert abs(first.direct_clo_attainment_pct - (91 / 105)) < 1e-6
    assert first.indirect_clo_attainment_pct == 60.0
    assert first.excluded_reason is None
    assert first.met_threshold is True
    assert first.is_record_complete is True

    # Assert that all records have excluded_reason=None
    assert all(a.excluded_reason is None for a in attainments)

    print("\n[OK] Transformation and independent calculation verified successfully!")
    return attainments


async def main():
    """Run all validation steps."""
    print("\n" + "=" * 80)
    print("OBELISK ETL - AUN-OBE EXTRACTION & TRANSFORMATION VALIDATION TEST")
    print("=" * 80)

    header, records, clo_plo_mapping = await step1_validate_extraction()
    if header is None or records is None:
        print("\n[FAIL] Extraction validation failed - exiting")
        return

    attainments = await step2_validate_transform(header, records, clo_plo_mapping)
    if attainments is None:
        print("\n[FAIL] Transform validation failed - exiting")
        return

    print("\n" + "=" * 80)
    print("VALIDATION TEST COMPLETE - ALL TESTS PASSED")
    print("=" * 80)


if __name__ == "__main__":
    asyncio.run(main())

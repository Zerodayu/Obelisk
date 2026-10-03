import tempfile
import unittest
from pathlib import Path
from openpyxl import Workbook

from app.etl import etl_const
from app.etl.composite_attainment import compute_composite_clo, compute_clo_level
from app.etl.extract.extractor import ExcelExtractor
from app.etl.transform.transformer import SimpleTransformer
from app.schemas.class_record import ClassRecordHeader
from app.schemas.extracted import StudentRawCloData


class TestCompositeAttainmentPureMath(unittest.TestCase):
    def test_70_30_composite_calculation(self):
        # Direct: 0.80 (80%), Indirect: 90.0 (90%) -> 0.70*80 + 0.30*90 = 56 + 27 = 83.00
        comp = compute_composite_clo(0.80, 90.0)
        self.assertEqual(comp, 83.0)

    def test_fallback_when_indirect_is_none(self):
        # Direct: 0.75 (75%), Indirect: None -> 75.00
        comp = compute_composite_clo(0.75, None)
        self.assertEqual(comp, 75.0)

    def test_indirect_zero_is_not_treated_as_missing(self):
        # Direct: 0.80 (80%), Indirect: 0.0 -> 0.70*80 + 0.30*0 = 56.00
        comp = compute_composite_clo(0.80, 0.0)
        self.assertEqual(comp, 56.0)

    def test_direct_scale_validation(self):
        # Direct must be non-negative. Negative should raise ValueError.
        with self.assertRaises(ValueError):
            compute_composite_clo(-0.1, 80.0)
        # Strict scale check should raise ValueError if fraction exceeds 1.0
        with self.assertRaises(ValueError):
            compute_composite_clo(1.05, 80.0, strict_scale=True)

    def test_indirect_scale_validation(self):
        # Indirect must be 0-100 percentage. Out-of-range should raise ValueError.
        with self.assertRaises(ValueError):
            compute_composite_clo(0.80, -5.0)
        with self.assertRaises(ValueError):
            compute_composite_clo(0.80, 105.0)

    def test_rounding_boundary(self):
        # 69.996 -> 70.00 -> Met
        # Direct = 0.69996, Indirect = None -> 69.996 * 100 = 69.996 -> round(69.996, 2) = 70.0
        comp = compute_composite_clo(0.69996, None)
        self.assertEqual(comp, 70.00)

        # Check threshold and level mapping on the rounded composite
        met = comp >= (etl_const.Transformation.INSTITUTIONAL_THRESHOLD * 100.0)
        level = compute_clo_level(comp)
        self.assertTrue(met)
        self.assertEqual(level, etl_const.AttainmentLevels.PROFICIENT)

    def test_mixed_composite_and_direct_only_mean_aggregation(self):
        from app.analytics.institutional_summary import _calculate_mean_attainment_pct
        rows = [
            {'composite_clo_attainment_pct': 80.0, 'direct_clo_attainment_pct': 0.80},
            {'composite_clo_attainment_pct': None, 'direct_clo_attainment_pct': 0.60},
        ]
        mean = _calculate_mean_attainment_pct(rows)
        self.assertAlmostEqual(mean, 0.70, places=4)

    def test_clo_levels_classification(self):
        self.assertEqual(compute_clo_level(85.0), etl_const.AttainmentLevels.EXCEPTIONAL)
        self.assertEqual(compute_clo_level(84.99), etl_const.AttainmentLevels.PROFICIENT)
        self.assertEqual(compute_clo_level(70.0), etl_const.AttainmentLevels.PROFICIENT)
        self.assertEqual(compute_clo_level(69.99), etl_const.AttainmentLevels.BASIC)
        self.assertEqual(compute_clo_level(60.0), etl_const.AttainmentLevels.BASIC)
        self.assertEqual(compute_clo_level(59.99), etl_const.AttainmentLevels.BELOW_BASIC)


class TestAunObeRealWorkbookIntegration(unittest.IsolatedAsyncioTestCase):
    async def test_real_template_student_aa_attainment(self):
        template_path = Path("classrecord_templates/JMCFI_Class_Record_Template_AUN-OBE.xlsx")
        if not template_path.exists():
            self.skipTest("Template workbook not found")

        extractor = ExcelExtractor()
        transformer = SimpleTransformer()

        extracted = await extractor.extract(template_path)
        attainments = await transformer.transform(extracted)

        self.assertTrue(len(attainments) > 0)

        # Find Student AA
        student_aa_clo1 = next((a for a in attainments if a.student_name == "AA" and a.clo_code == "CLO1"), None)
        student_aa_clo3 = next((a for a in attainments if a.student_name == "AA" and a.clo_code == "CLO3"), None)

        self.assertIsNotNone(student_aa_clo1)
        self.assertIsNotNone(student_aa_clo3)

        # In template:
        # CLO1: Direct is 78/90 = 86.67%, Indirect is 3.0/5 = 60.0% -> composite = 0.70*86.6667 + 0.30*60.0 = 78.67%
        self.assertEqual(student_aa_clo1.composite_clo_attainment_pct, 78.67)
        self.assertTrue(student_aa_clo1.met_threshold)
        self.assertEqual(student_aa_clo1.clo_level, etl_const.AttainmentLevels.PROFICIENT)

        # CLO3: Direct is 100/100 = 100.0%, Indirect is 4.0/5 = 80.0% -> composite = 0.70*100 + 0.30*80 = 94.00%
        self.assertEqual(student_aa_clo3.composite_clo_attainment_pct, 94.0)
        self.assertTrue(student_aa_clo3.met_threshold)
        self.assertEqual(student_aa_clo3.clo_level, etl_const.AttainmentLevels.EXCEPTIONAL)

    async def test_no_indirect_sheet_or_scores_fallback_in_transformer(self):
        """
        Verify transformer behavior when records have no indirect rating (indirect_rating = None):
        composite_clo_attainment_pct must fall back exactly to 100 * direct_fraction,
        and indirect_clo_attainment_pct should be None.
        """
        transformer = SimpleTransformer()
        header = ClassRecordHeader(
            course_code="IT 101",
            course_title="Intro to Computing",
            course_type="LECTURE",
            section="BSIT-1A",
            semester_year="2026-2027 1st Sem",
            instructor_name="Prof. Test",
            no_of_students=1,
            threshold=0.70,
            grading_system="STANDARD",
        )
        record = StudentRawCloData(
            student_id="2026-0001",
            student_name="Test Student",
            clo_code="CLO1",
            prelim_score=20.0,
            prelim_max=25.0,
            midterm_score=40.0,
            midterm_max=50.0,
            final_score=20.0,
            final_max=25.0,
            indirect_rating=None,  # No indirect assessment provided
        )

        extracted = (header, [record], [])
        attainments = await transformer.transform(extracted)

        self.assertEqual(len(attainments), 1)
        att = attainments[0]
        # Direct: 80 / 100 = 0.80 -> 80.0%
        self.assertAlmostEqual(att.direct_clo_attainment_pct, 0.80, places=4)
        self.assertIsNone(att.indirect_clo_attainment_pct)
        # Composite falls back to direct: 80.0%
        self.assertEqual(att.composite_clo_attainment_pct, 80.0)
        self.assertTrue(att.met_threshold)
        self.assertEqual(att.clo_level, etl_const.AttainmentLevels.PROFICIENT)


if __name__ == "__main__":
    unittest.main()

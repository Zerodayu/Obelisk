import unittest

from app.etl.indirect_attainment import compute_indirect_clo_attainment


class TestIndirectAttainment(unittest.TestCase):
    def test_compute_indirect_clo_attainment_returns_expected_percentage(self):
        self.assertEqual(compute_indirect_clo_attainment(3.2, 4), 80.0)
        self.assertEqual(compute_indirect_clo_attainment(4.0, 5), 80.0)
        self.assertEqual(compute_indirect_clo_attainment(0, 5), 0.0)
        self.assertEqual(compute_indirect_clo_attainment(5, 5), 100.0)

    def test_compute_indirect_clo_attainment_raises_for_zero_scale_max(self):
        with self.assertRaises(ValueError):
            compute_indirect_clo_attainment(3.2, 0)

    def test_compute_indirect_clo_attainment_raises_for_exceeding_mean_rating(self):
        with self.assertRaises(ValueError):
            compute_indirect_clo_attainment(6, 5)


if __name__ == "__main__":
    unittest.main()



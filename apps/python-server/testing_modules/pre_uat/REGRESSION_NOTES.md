# Verified deterministic regressions and compatibility

Final Phase 2A `20261011T063734_111127Z`: **18 PASS, 0 FAIL, 8 historically deferred SKIPPED**. These 18 PASS rows remain current; integration later added two PASS rows. UT-004 has **98 passing subchecks and 101 recorded expected/actual observations**. These are subchecks, not additional IDs.

## Approved application changes

| Source boundary | Change | Compatibility retained |
| --- | --- | --- |
| SimpleTransformer._transform_v2_records | Reject negative non-null period scores with structured TransformationError before summing. | Zero, null, extra credit, existing calculations/rounding/thresholds; no clamping. |
| ExcelExtractor._read_numeric_cell | Strict parsing for scores and indirect ratings; errors include sheet/cell/field and sanitized reason. | Genuinely blank/whitespace missing values, finite numbers/numeric strings; unrelated metadata/max parsing unchanged. |
| ExcelExtractor._validate_roster_ids / identity lookup | Reject repeated nonblank IDs within a sheet; unambiguous name fallback. | Matching IDs across sheets; optional IDs; valid distinct IDs sharing a name. |
| ExcelExtractor._validate_clo_codes | Reject duplicate discovered/normalized codes and indirect headers resolving to the same code. | Dynamic layouts and cross-sheet matching; no new case folding/registry rules. |
| WorkbookValidationError | Use OBELISKError structured metadata without identities/raw invalid values. | Existing worker error envelope. |
| generate_cqi_recommendation / normalize_llm_response | Validate course JSON and reject blank/non-string responses. | String output, valid fences, nullable pattern, single recommendation; shared provider settings/failover unchanged. |
| generate_institutional_summary | Reject invalid/blank text; no course-schema requirement. | Successful nonempty prose and numerical summaries; no-gaps shortcut retained. |

## Extra credit and independent outputs

The original 26/25 score case was accepted already. Its rejection assertion was an incorrect compatibility expectation; the approved replacement independently verifies direct 0.86 and composite 87.20. Added cases include direct attainment above 100% without denominator changes or clamping. This verifies existing implementation behavior, not independently documented institutional grading policy.

Malformed input assertions were retained/strengthened, not removed to manufacture PASS. Literal NaN/infinities are tested before workbook saving because openpyxl may serialize those float literals as blank cells; nonfinite strings and Excel error cells are tested through actual workbook parsing. [UT-004 exact subchecks](evidence/20261011T063734_111127Z/UT-004_result.txt) distinguishes these routes.

## Compatibility evidence

[Compatibility comparison](evidence/20261011T063734_111127Z/COMPATIBILITY.json) verifies identical actual observations for all 17 previously passing IDs against `20261011T062718_385853Z`; only extractor/exceptions changed in that final correction. Earlier approved AI/negative-score fixes were already present. All eleven original scripts match the prior baseline. Independent fixture/oracle assertions verify 70/30, 70% boundary, rounding, levels, missing data and numerical inputs to mocked AI. No source hash alone proves an unexecuted assertion.

No saved real class-record workbook was used; compatibility is for tested synthetic valid layouts and unchanged selected historical methods. Institutional policy, curriculum registry, approval/UI/database behavior and arbitrary AI prose remain outside this regression claim.

## Exact historical methods reused

- `testing_modules/old_test/test_etl_v2.py::TestETLV2Pipeline.test_dynamic_clo_count_discovery`
- `testing_modules/old_test/test_composite_attainment.py::TestCompositeAttainmentPureMath.test_direct_scale_validation`
- `testing_modules/old_test/test_composite_attainment.py::TestCompositeAttainmentPureMath.test_indirect_scale_validation`
- `testing_modules/old_test/test_composite_attainment.py::TestCompositeAttainmentPureMath.test_70_30_composite_calculation`
- `testing_modules/old_test/test_composite_attainment.py::TestCompositeAttainmentPureMath.test_fallback_when_indirect_is_none`
- `testing_modules/old_test/test_composite_attainment.py::TestCompositeAttainmentPureMath.test_indirect_zero_is_not_treated_as_missing`
- `testing_modules/old_test/test_etl_v2.py::TestIndirectAttainment.test_compute_indirect_clo_attainment_returns_expected_percentage`
- `testing_modules/old_test/test_etl_v2.py::TestIndirectAttainment.test_compute_indirect_clo_attainment_raises_for_zero_scale_max`
- `testing_modules/old_test/test_etl_v2.py::TestIndirectAttainment.test_compute_indirect_clo_attainment_raises_for_exceeding_mean_rating`
- `testing_modules/old_test/test_composite_attainment.py::TestAunObeRealWorkbookIntegration.test_no_indirect_sheet_or_scores_fallback_in_transformer`
- `testing_modules/old_test/test_composite_attainment.py::TestCompositeAttainmentPureMath.test_rounding_boundary`
- `testing_modules/old_test/test_composite_attainment.py::TestCompositeAttainmentPureMath.test_clo_levels_classification`
- `testing_modules/old_test/test_composite_attainment.py::TestCompositeAttainmentPureMath.test_mixed_composite_and_direct_only_mean_aggregation`
- `testing_modules/old_test/test_etl_v2.py::TestETLV2Pipeline.test_independent_recomputation_ignores_tampered_formula_column`

Only safe imports/class definitions were loaded through the existing AST helper. The class named `TestAunObeRealWorkbookIntegration` contributed its synthetic fallback method, not its real-workbook method. Fourteen constituent methods do not increase the 26-ID total.

Initial 15/3 and intermediate 17/1 outcomes and their original failures are preserved in [TESTING_HISTORY.md](TESTING_HISTORY.md). Current integration status is PASS; performance status remains BLOCKED/SKIPPED. Reproduction commands are in [README.md](README.md); no commands were run during this consolidation.

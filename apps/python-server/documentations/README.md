# Python server documentation

Start here for current usage. Commands in the guides run from `apps/python-server/`, not from this folder.

| What you want to do | Read |
| --- | --- |
| Install and start the Python service | [Service README](../README.md) |
| Run offline regression tests or understand Pre-UAT runners | [Testing guide](TESTING.md) |
| Run or replay the 150-case AI accuracy evaluation | [AI accuracy guide](AI_ACCURACY_EVALUATION.md) |
| Understand the implementation and service ownership | [System design](SYSTEM-DESIGN.md) |
| Follow the request/processing flow step by step | [System process explained](SYSTEM_PROCESS_EXPLAINED.md) |
| Integrate the webapp backend with Python | [HTTP integration contract](INTEGRATION.md) |
| Check attainment calculations and thresholds | [Canonical formulas](FORMULAS.md) |
| Find workbook cells and calculation constants | [Constants](CONSTANTS.md) |
| Understand unresolved implementation and verification limits | [Known limitations](KNOWN_LIMITATIONS.md) |
| Review security and performance analysis | [Analysis and recommendations](ANALYSIS_AND_RECOMMENDATIONS.md) |

## Current guides and historical records

The testing guide combines repeated setup, commands, isolation, fixtures, exit codes and runner selection. The AI accuracy guide stays separate because it scores 150 model classifications and assesses CQI grounding; it is not the institutional ST-AI suite. The system design is now here; its [old root location](../SYSTEM-DESIGN.md) remains a forwarding link. Test-directory READMEs link to the guides rather than maintain additional copies of operating instructions.

The following documents remain in `testing_modules/pre_uat/` because they describe dated executions, submission material, audits or evidence provenance. Moving or merging them could break evidence links, runner-generated paths and the distinction between different scopes. They are separate references, not additional commands you need to follow to run the legacy tests.

| Historical reference | Purpose |
| --- | --- |
| [Package README](../testing_modules/pre_uat/README.md) | October 11 institutional package context |
| [Final summary](../testing_modules/pre_uat/PRE_UAT_FINAL_SUMMARY.md) | Submission scope and 26-ID outcome summary |
| [Detailed results](../testing_modules/pre_uat/PRE_UAT_RESULTS.md) / [CSV](../testing_modules/pre_uat/PRE_UAT_RESULTS.csv) | Saved mutable runner reports; not a fresh execution |
| [Evidence index](../testing_modules/pre_uat/EVIDENCE_INDEX.md) | Per-ID source artifacts and original timestamps |
| [Testing history](../testing_modules/pre_uat/TESTING_HISTORY.md) | Earlier executions and changing outcomes |
| [Coverage audit](../testing_modules/pre_uat/COVERAGE_AUDIT.md) | Verified assertions, missing coverage and external responsibilities |
| [Defects](../testing_modules/pre_uat/DEFECTS.md) | Historical defects, corrected expectations and remaining limits |
| [Regression notes](../testing_modules/pre_uat/REGRESSION_NOTES.md) | October 11 corrections and preserved compatibility |
| [Documentation audit](../testing_modules/pre_uat/DOCUMENTATION_AUDIT.md) | Prior consolidation and original snapshots |
| [Webapp compatibility audit](../testing_modules/pre_uat/BACKWARD_COMPATIBILITY_AUDIT.md) | Static contract findings; not end-to-end acceptance |
| [Integration record](../testing_modules/pre_uat/INTEGRATION_README.md) | IT-007/009 real disposable Redis correctness evidence |
| [Performance record](../testing_modules/pre_uat/PERFORMANCE_README.md) | Prepared workloads, blockers and unmeasured metrics |
| [Startup diagnostics](../testing_modules/pre_uat/STARTUP_DIAGNOSTIC_NOTES.md) | Historical lifecycle/ownership failures |
| [Performance harness remediation](../testing_modules/pre_uat/PERFORMANCE_HARNESS_REMEDIATION.md) | Implementation review; runtime verification pending in that record |
| [Phase 2B final verification](../testing_modules/pre_uat/PHASE2B_FINAL_VERIFICATION.md) | Evidence inventory and submission mapping |
| [Institutional AI report](../testing_modules/pre_uat/AI_ACCURACY_REPORT.md) | Small-fixture CQI grounding and pending academic review |
| [Live AI evidence workflow](../testing_modules/pre_uat/LIVE_AI_EVIDENCE_README.md) | ST-AI-001/002/004 saved responses, provenance and numerical checking |
| [ST-AI-001 live notes](../testing_modules/pre_uat/ST_AI_001_LIVE_NOTES.md) | Original successful and invalid-key execution variants |

## Evidence folders

- [Institutional evidence](../testing_modules/pre_uat/evidence/): original per-ID records, source manifests, logs and snapshots.
- [AI accuracy evidence](../testing_modules/pre_uat/ai_accuracy_evaluation/evidence/): separate UTC-dated 150-case evaluations; see the [AI guide](AI_ACCURACY_EVALUATION.md) for specific runs.
- [Dashboard outputs](../testing_modules/pre_uat/dashboard_outputs/): dated exports and their README files. These are rendered evidence views, not new executions.
- [Legacy README](../testing_modules/old_test/README.md): directory entry point and original October 13 repair record.

Keep dated evidence and submitted reports in place. Do not combine the 50 legacy unittest cases, the 26 institutional IDs, the smaller CQI claim samples and the 150 classification cases into one test total.

## Consolidation record — October 14, 2026

Reviewed service documentation, legacy and Pre-UAT READMEs, report purposes, runner entry points and saved AI provenance. No byte-identical standalone current guides were found. The identical AI-evidence README files belong to different dated runs and remain untouched. Repeated operating instructions were consolidated into the two guides above. Architecture, process explanation, HTTP contracts, formulas, constants, limitations and analysis remain separate because they serve different purposes.

Only Markdown documentation was changed. No tests, provider calls, services, configuration changes or dependency operations were performed for this consolidation. Historical outcomes retain their original dates, scopes and model IDs. Remaining manual review includes academic CQI assessment, webapp contract findings, performance ownership/cleanup verification and effective model overrides before any future live evaluation.

Files added or updated: this index, `TESTING.md`, `AI_ACCURACY_EVALUATION.md`, the relocated `SYSTEM-DESIGN.md`, service-root `README.md` and the forwarding `SYSTEM-DESIGN.md`, plus the legacy, Pre-UAT and AI-evaluation directory READMEs. All other references listed above remain in place.

Verification checked 107 local links across these nine Markdown files with no missing targets, balanced code fences and no Git whitespace errors. Before/after hashes of 664 existing application/test/workbook files showed changes only to the three intended test-directory READMEs; the remaining 661 files, including `app/core/config.py`, test scripts and dated evidence, were unchanged.

# Documentation consolidation and evidence audit

This is documentation-only work. No application tests, services, live APIs or benchmarks ran. Production sources, test harnesses, historical tests and all timestamped evidence are protected by before/after file hashes.

## Reconciled records

Saved consolidated JSON, current CSV and all per-ID artifacts agree: 26 unique IDs; 20 PASS, 0 FAIL, 5 BLOCKED, 1 SKIPPED. Passing timestamps are carried forward exactly. Unexecuted record timestamps are explicitly distinguished from execution timestamps. Every original timestamped directory remains.

## Historical discrepancies corrected in active documents

- Layered 'current' sections still described failed UT-004/008/009 or blocked integration after later PASS evidence. Those are now clearly historical in [TESTING_HISTORY.md](TESTING_HISTORY.md).
- Initial 15/3 and intermediate 17/1 outcomes each have two saved runs; neither repetition increases ID totals. The early socketpair attempt has zero executed test-body assertions.
- `20261011T065750_252644Z` is an inspection-only directory, not a successful harness/test run; it has no RESULTS.json.
- The performance attempt lost its primary error through cleanup overwrite; its immutable artifact is retained. The later diagnostic records independent ownership/cleanup failures. HTTP 200 did not prove ownership.
- Temporary-directory deadlock is a confirmed static hazard; original-run attribution lacks an original hang trace. The PID mismatch is current and directly evidenced by launcher/control records.
- Extra credit is tested existing implementation behavior, not independently verified institutional policy. Documentary performance figures lack attributable raw artifacts and are not accepted PT measurements.
- Historical subchecks/method reuse, intentionally failed malformed jobs, prerequisite attempts and diagnostics are not extra Pre-UAT IDs.

No numeric-result discrepancy requires changing an immutable artifact. Missing historical traces, absent benchmark metrics and institutional approvals cannot be supplied through documentation.

## Original documentation snapshots

These verbatim `.txt` snapshots are historical source documents, not active/current status reports. Their embedded 'current' wording reflects the older document context. [Testing history](TESTING_HISTORY.md) supplies reconciled chronology; use active Markdown for latest status.

| Original document (historical snapshot) | Preserved bytes |
| --- | --- |
| COVERAGE_AUDIT.md | [snapshot](documentation_snapshots/COVERAGE_AUDIT.md.txt) |
| DEFECTS.md | [snapshot](documentation_snapshots/DEFECTS.md.txt) |
| INTEGRATION_README.md | [snapshot](documentation_snapshots/INTEGRATION_README.md.txt) |
| PERFORMANCE_README.md | [snapshot](documentation_snapshots/PERFORMANCE_README.md.txt) |
| PRE_UAT_RESULTS.md | [snapshot](documentation_snapshots/PRE_UAT_RESULTS.md.txt) |
| README.md | [snapshot](documentation_snapshots/README.md.txt) |
| REGRESSION_NOTES.md | [snapshot](documentation_snapshots/REGRESSION_NOTES.md.txt) |
| STARTUP_DIAGNOSTIC_NOTES.md | [snapshot](documentation_snapshots/STARTUP_DIAGNOSTIC_NOTES.md.txt) |

## Validation

The documentation-only check completed successfully on October 11, 2026:

- 26 unique IDs in CSV, latest Markdown results and the evidence index.
- Matching status counts: 20 PASS, 0 FAIL, 5 BLOCKED, 1 SKIPPED.
- 193 relative links checked; no missing targets.
- Original status timestamps and evidence references preserved for all 26 IDs;
  the 20 executed PASS timestamps remain unchanged.
- 345 protected/source/evidence files compared by SHA-256, with no changes;
  all 232 historical evidence files and all 13 directories preserved.
- Exact saved executed-test functions resolved with AST inspection, without
  importing or executing them. All saved JSON and per-ID result records parsed.

This successful documentation check is not an additional Pre-UAT test ID and
does not change any BLOCKED/SKIPPED status.

Run the documentation-only checker described in [README.md](README.md). The machine-readable [validation record](DOCUMENTATION_VALIDATION.json) records actual counts, link/file checks, original timestamp comparison and hash preservation. No test PASS is created by that checker. Future benchmark/debugging work remains paused.

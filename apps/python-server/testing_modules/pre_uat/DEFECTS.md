# Defects, corrected expectations and remaining limitations

Current executed Python-side tests are PASS. Historical reproductions are indexed in [TESTING_HISTORY.md](TESTING_HISTORY.md); these resolved findings are not current failed test IDs.

| Finding | Affected ID | Correction / disposition | Current evidence |
| --- | --- | --- | --- |
| Negative period scores accepted | UT-004 | Reject non-null negative PRELIM/MIDTERM/FINAL before calculation using structured errors; preserve zero/null/extra credit. | [PASS](evidence/20261011T063734_111127Z/UT-004_result.txt) |
| Malformed nonblank numeric score/rating treated as missing | UT-004 | Strict dedicated cell parser rejects text/errors/booleans/nonfinite values; accepts genuine blanks and valid numeric strings; metadata parser unchanged. | [PASS](evidence/20261011T063734_111127Z/UT-004_result.txt) |
| Duplicate IDs/CLOs and ambiguous fallback could overwrite records | UT-004 | Reject within-sheet normalized collisions before insertion; preserve cross-sheet matches, optional IDs and unambiguous fallback. | [PASS](evidence/20261011T063734_111127Z/UT-004_result.txt) |
| Malformed course recommendation JSON accepted | UT-008 | Validate required schema/types and return existing error envelope; preserve fenced JSON, nullable pattern, single recommendation and string response. | [PASS](evidence/20261011T063734_111127Z/UT-008_result.txt) |
| Blank/non-string course or institutional response reported successful | UT-009 | Normalize/reject invalid responses at boundaries; preserve nonempty institutional prose, no_gaps_found/null shortcut and shared provider behavior. | [PASS](evidence/20261011T063734_111127Z/UT-009_result.txt) |
| Above-maximum rejection expected by original test | UT-004 | Incorrect test expectation corrected under approval. Existing extra-credit behavior retained; no institutional policy certification. | [98 passing subchecks](evidence/20261011T063734_111127Z/UT-004_result.txt) |

## Production correction boundaries

Approved changes occurred in `app/etl/transform/transformer.py`, `app/etl/extract/extractor.py`, `app/core/exceptions.py`, `app/analytics/cqi_recommender.py` and `app/analytics/institutional_summary.py`. Exact paths/functions and compatibility evidence are in [REGRESSION_NOTES.md](REGRESSION_NOTES.md). No production code was changed during integration, performance preparation/diagnostics or this consolidation.

## Harness findings — not production defects

- The initial Phase 2A Windows wakeup-pipe block was corrected before deterministic execution.
- Performance readiness failures bypassed the inner shutdown block; later cleanup overwrote the primary error. Shared lifecycle cleanup and separate error records now address these paths, but graceful shutdown has not yet passed verification.
- A 20-second readiness deadline previously allowed 30-second attempts. Attempts are now bounded by remaining time, HTTP status is checked, and subprocess exit is monitored.
- Critical-only logging suppressed useful diagnostics. Error-level logging and sanitized stage/exception records now exist.
- Temporary-directory discovery inside the open audit hook had a reentrancy/deadlock hazard. Caching before hook installation allowed later startup to reach HTTP 200. Original attribution remains inferential because the earlier run lacked a hang trace.
- **Unresolved:** Windows SDK launcher PID versus server PID mismatch prevents exact ownership verification. Current code refuses shutdown and retains BLOCKED status. Future correction must prove server membership in the owned process job; it must not discard PID checks. Resource monitoring must then use the proven server PID.

## Other limitations / static concerns

Python advice is advisory computational output; semantic quality and approval/RBAC enforcement need human/webapp evidence. Numeric prose beyond the supported checker grammar is manual review. Gemini errors may expose provider exception/key previews in live use; live redaction/latency/quotas remain untested. Queue capacity uses separate Redis operations; multi-process saturation races remain a static concern, not a reproduced defect. Current workers retain uploads/job keys until owned test cleanup; retained growth is not automatically a leak. Source guide descriptions drift from current 70/30/live-provider behavior; effective deployment configuration was not loaded.

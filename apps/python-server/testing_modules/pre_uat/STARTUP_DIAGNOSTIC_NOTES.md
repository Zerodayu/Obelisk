# Startup-only diagnostic findings — current blocker, debugging paused

This document concerns harness diagnostics, not performance test execution. Current Pre-UAT totals remain 20 PASS, 0 FAIL, 5 BLOCKED and 1 SKIPPED. Prior evidence was not rewritten.

## Confirmed code defects and correction state

Readiness ran outside the old shutdown try/finally; cleanup overwrote the primary exception; per-request timeout exceeded overall readiness bounds; critical-only logging hid useful error diagnostics. Shared lifecycle helpers now cover launch/readiness/workload cleanup, preserve independent sanitized errors, check process exit and HTTP status, bound attempts, and record stages. These changes are implemented; successful graceful lifecycle verification remains incomplete.

Shutdown now requires owned nonce/Redis/process proof through a private stdin channel. HTTP control also requires a nonce. The new process job is kill-on-close and cleanup targets only that job/created subprocess, not container/process names. Server guards prohibit spawning descendants. No ownership/network/import guard was disabled.

## Temporary-directory hazard

Original `performance_environment.install_guards.audit` called `tempfile.gettempdir()` inside every open event. On first discovery Python 3.13 holds a non-reentrant `_once_lock` while probing a directory with `os.open`, re-entering the callback and lock. This is a confirmed static deadlock path. The new child evidence reports `temp_directory_was_uninitialized: true`; caching before hook installation allowed imports and Uvicorn startup to proceed. Attribution to the original hang is strongly supported but inferential because no original hang stack was captured. The file-policy roots remain unchanged.

## Actual latest diagnostic

Run `20261011T075026_653371Z`: readiness attempts show a ConnectTimeout followed by HTTP 200. Exact ownership comparison failed with `PrerequisiteBlocked: HTTP ownership identity mismatch`. `Popen.pid` was 13620; child startup/control records report 24656. The Windows configured SDK launcher/server process distinction is incompatible with equality to launcher PID alone. The HTTP response body was not saved, so do not assert that every other handshake field was separately verified.

Cleanup separately records `Owned child control identity mismatch` and missing `SERVER_PROOF.json`. No shutdown command was sent without ownership. The owned job was closed and both tracked PIDs were absent on the follow-up process check. Disposable Redis and temporary uploads were removed. Graceful server/worker stop is **NOT VERIFIED**. The recorded exit code after forced job closure is not proof of an application crash or graceful shutdown.

The intentional pre-readiness failure plus injected cleanup-diagnostic error is **prepared but NOT EXECUTED**. The normal diagnostic failed, so no second subprocess or retry was started. No application workload, benchmark or production change occurred.

## Proposed correction, not implemented

Verify the actual server PID with an opened handle and `IsProcessInJob` for this owned Windows job, plus exact nonce and Redis identity. Retain the launcher identity; do not merely accept mismatched PIDs. Correct the resource-monitor target to the proven server process. Consider suspended launch/job assignment/resume to close the assignment race. Capture sanitized expected/observed fields in future evidence. Separate approval is required; debugging is paused.

## Saved artifacts

[Overall result](evidence/20261011T075026_653371Z/DIAGNOSTIC_RESULTS.json), [stages](evidence/20261011T075026_653371Z/normal_startup/STARTUP_STAGES.json), [child identity](evidence/20261011T075026_653371Z/normal_startup/CHILD_CONTROL.json), [attempts](evidence/20261011T075026_653371Z/normal_startup/READINESS_ATTEMPTS.json), [cleanup errors](evidence/20261011T075026_653371Z/normal_startup/PROCESS_CLEANUP.json), [PID exit check](evidence/20261011T075026_653371Z/OWNED_PROCESS_EXIT_CHECK.json), [Redis/temp cleanup](evidence/20261011T075026_653371Z/ISOLATION.json), [protected hashes](evidence/20261011T075026_653371Z/SOURCE_MANIFEST.json).

Original blocked performance attempt: [20261011T073848_090587Z](evidence/20261011T073848_090587Z/RESULTS.json), [initial cleanup proof](evidence/20261011T073848_090587Z/ISOLATION.json). Neither diagnostic constitutes a PT PASS. Reproduction reference is in [PERFORMANCE_README.md](PERFORMANCE_README.md); no diagnostic is executed during consolidation.

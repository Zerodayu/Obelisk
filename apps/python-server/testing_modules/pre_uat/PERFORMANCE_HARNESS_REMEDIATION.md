# Performance harness remediation — Stage 1

**BLOCKED — Stage 2 execution approval and runtime ownership/cleanup verification pending.** Harness implementation only. No diagnostic, container, API server, smoke request, Gemini request, integration rerun, or PT workload was executed. No PT test was marked PASS. IT-007/IT-009 historical PASS records and all existing institutional results remain unchanged.

Review HEAD: `66cf2e0cb8402e97926747558c9f4be954835de1`; implementation is an uncommitted working-tree change. Stage 2 will record both its actual HEAD and SHA-256 source manifest. [Prior audit](PHASE2B_FINAL_VERIFICATION.md) remains the historical evidence reference.

## Root cause and correction

Historical diagnostic `20261011T075026_653371Z` reached HTTP 200 but compared launcher PID 13620 with serving PID 24656. Windows virtual-environment redirectors can launch a separate interpreter; current repository-local `pyvenv.cfg` confirms the configured SDK uses an external base interpreter. The historical parent relationship was not captured, so that specific mechanism remains strongly supported rather than independently proven. The incorrect equality assumption is confirmed in the old lifecycle helper. HTTP acceptance alone was never adequate ownership proof.

The former post-launch job assignment also allowed a child to execute before containment. Merely suspending before a separate assignment would still leave a suspended orphan if the parent crashed between those operations. The implementation now uses native `CreateProcessW` with `CREATE_SUSPENDED`, `EXTENDED_STARTUPINFO_PRESENT`, an explicit inherited handle list, and `PROC_THREAD_ATTRIBUTE_JOB_LIST`. Windows assigns the newly created unnamed Job Object at creation. No weaker fallback exists. Unsupported APIs, failed creation or incompatible inherited/nested jobs block execution. [Microsoft job-list documentation](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-updateprocthreadattribute)

The job has kill-on-close and no breakaway permission. Its handle is noninheritable. Only child stdin and log handles are explicitly inherited. The parent retains process/thread handles, verifies launcher membership with `IsProcessInJob`, and calls documented `ResumeThread` only after that proof. Atomic containment also covers the redirector's interpreter descendant. [Membership documentation](https://learn.microsoft.com/en-us/windows/win32/api/jobapi/nf-jobapi-isprocessinjob), [ResumeThread documentation](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-resumethread)

Readiness uses a bearer nonce on the private loopback ownership endpoint. HTTP identity must exactly match private child-control identity: nonce, Redis run ID, unique queue prefix, serving PID and process creation time, plus expected worker/upload defaults and zero initial mock calls. Production queue-key construction is checked against the expected namespace inside the guarded child. The parent opens the reported server for query/read/synchronize only, verifies membership in this exact job and creation time, and retains that handle. An unrelated PID can never become a cleanup target. New runtime metadata will distinguish current launcher/server identities without using historical PIDs.

## Exact approved files changed

| File under `testing_modules/pre_uat/` | Implementation |
| --- | --- |
| `windows_owned_process.py` (new) | Typed native Windows structures/APIs, atomically contained suspended creation, retained handles, member/creation-time checks, job accounting, bounded waits and handle-based abort/termination |
| `performance_lifecycle.py` | Authenticated HTTP/private handshake, serving handle verification, separate primary/cleanup errors, bounded cleanup, normal/failure/smoke case gates |
| `performance_environment.py` | Current-run-only writes, repository-local temp root, recursive-delete denial, own-process/retained-server monitoring, existing resource limits retained |
| `performance_server.py` | Namespace/authentication checks, runtime identity, bounded worker cancellation/executor drain, stronger server shutdown proof and sanitized logs |
| `integration_environment.py` | Exclusively created repository-local scratch, Docker create-ID/cidfile before start, exact ID+label removal proof, explicit recorded-file/empty-directory cleanup, no recursive cleanup |
| `run_phase2b2.py` | Read-only preflight before services; normal/intentional diagnostics; a separate smoke mode gated by complete saved diagnostic cleanup; source/history preservation; full PT entry point disabled |
| `PERFORMANCE_HARNESS_REMEDIATION.md` (new) | This implementation review and Stage 2 proposal |

No production source, existing evidence or institutional result report was edited. Shared integration helpers change repository-local resource handling for future executions; no integration execution occurred.

## Cleanup design and bounds

Normal shutdown sends one small nonce-authenticated message over the inherited private stdin pipe. Worker cancellation/gather is bounded at five seconds; executor shutdown at four seconds. Executor timeout warnings are treated as failures, so they cannot produce a successful drain claim. The parent requires matching server identity/Redis namespace/defaults, the exact worker count, worker-stop/executor-drain proof, zero launcher exit code, no forced termination, signaled retained process handles and zero active job members. Default parent waits: readiness 20 seconds, each readiness attempt at most two seconds, graceful exit 12 seconds, forced cleanup 10 seconds.

Startup failure cleanup uses only the new retained job handle; creation-abort handling retains the original process/thread handles even if interrupted just after native creation. Kill-on-close is an additional parent-exit safeguard. If exit/accounting proof fails, the case is BLOCKED and no subsequent server or smoke request is launched. A kill request is not reported as proven cleanup without bounded exit verification.

Redis is created from an already cached image using `--pull=never`, a fresh name/nonce label, random loopback binding, disabled persistence, read-only root and a small tmpfs. Full container ID is recorded before start. Removal requires `docker inspect` to match **both** that ID and the current-run nonce label; then removal targets that full ID, followed by an absence check. No existing Redis or database is contacted. A failed Docker create without a recoverable recorded ID is BLOCKED and never triggers guessed cleanup by name.

Scratch directories are exclusively created below the fresh evidence directory. Python TEMP/TMP and tempfile routing use that root. File cleanup is individual `Path.unlink()` on registered current-run paths and `Path.rmdir()` on empty owned directories, with resolved-path/symlink/junction checks. Unknown files cause cleanup to block and remain for review. There is no recursive-delete implementation; audit hooks also reject `shutil.rmtree`. Evidence remains on disk.

## Validation and current outcome

Stage 1 performed source inspection and in-memory AST parsing/compilation of all six changed Python files with the configured Python 3.13 SDK and `-I -B`. All six passed syntax validation, with zero harness/application imports, diagnostics or workloads. The diff check scoped to the seven approved files passed. Runtime ctypes calls, Docker operations and network behavior are **NOT VERIFIED** at this stage; no passing runtime result is claimed.

Preservation was independently verified after implementation against a pre-edit aggregate SHA-256 of 406 production/evidence/institutional-result files: `44C0209F5746A9641D529C7F7EAFB2F152366CA89DFF85F7DFDB6D3E61B43759`. The aggregate includes every existing file under `app/` and `testing_modules/pre_uat/evidence/`, plus `PRE_UAT_RESULTS.md` and `PRE_UAT_RESULTS.csv`. All 406 files were unchanged. No Stage 1 evidence directory was created, because Stage 1 authorizes edits only to the seven listed files.

Validation incident: an overly broad repository diff check printed sensitive values from pre-existing root environment changes into tool output. No environment file was modified and the values are not repeated in this report. The check was corrected to the seven-file allowlist. Exposed credentials should be reviewed/rotated by the owner separately; this task does not authorize changing them.

Normal startup: NOT EXECUTED. Intentional startup failure: NOT EXECUTED. Graceful worker shutdown: NOT VERIFIED. Smoke: NOT EXECUTED. Full PT: DISABLED/NOT EXECUTED. Harness readiness: **BLOCKED pending approved Stage 2 verification**. Institutional performance targets remain a separate requirement before any PT acceptance decision.

## Remaining limitations and races

- Atomic job-list creation requires Windows 10+ and compatible nested-job rules; actual SDK/ctypes ABI and installed Uvicorn behavior need Stage 2 verification.
- Loopback API port selection currently releases a reservation before server bind. A competing binder causes readiness/identity failure; nonce, private proof and exact job membership prevent acceptance of another server. Prebound-socket handoff is not implemented.
- Handle retention plus creation time prevents PID-reuse substitution after opening. Local users with access to these project files are outside this harness's adversary model; it is resource isolation, not an OS security sandbox.
- OS-level termination/handle-close errors can prevent proof of cleanup. Those paths remain BLOCKED, without broad termination or subsequent launches.
- A Docker CLI/daemon failure before ID recording may leave an uncertain newly requested container; no guessed removal is allowed. The failure is preserved for ownership review.
- The full PT path remains explicitly disabled. Existing synthetic-workbook helpers outside the approved file set use automatic directory cleanup; they must be reviewed/reworked before future bounded PT execution under the nonrecursive-cleanup restriction. No edits outside the seven-file allowlist were made.
- Smoke diagnostics check a tiny analytics request; they do not establish ETL throughput, live AI latency, sustained capacity or performance acceptance.

## Proposed Stage 2 commands — NOT EXECUTED

Recheck the configured SDK first. From the Python service root, with fresh user approval:

```powershell
& '.\.venv\Scripts\python.exe' -B testing_modules/pre_uat/run_phase2b2.py --startup-only
```

This creates one fresh timestamped directory and one owned Redis container; performs host/Docker/ports/process/resource/environment-name preflight before container/API creation; runs normal and intentional-failure API lifecycles sequentially; verifies complete process, Redis and scratch cleanup; saves diagnostics/source/identity/log/cleanup evidence. A failed first case prevents launching the second. No synthetic workload request runs.

Only if that command exits zero and its normal/failure and resource-cleanup proof passes, propose:

```powershell
& '.\.venv\Scripts\python.exe' -B testing_modules/pre_uat/run_phase2b2.py --smoke-after 'testing_modules/pre_uat/evidence/<directory-returned-by-startup-only>'
```

The exact directory is generated by the authorized first run and cannot be known in advance. This command rejects incomplete proof or changed harness hashes before creating resources, then repeats preflight in a fresh directory with fresh Redis/API resources. After current ownership passes, it sends exactly one synthetic `POST /analytics/summary`: two anonymous records at 0.60 and 0.80 for one CLO/PLO; expected CLO/PLO/program mean 0.70, record count two and complete Rule 1/3. It captures elapsed time for diagnostics, checks zero provider calls/job keys/uploads and verifies full cleanup. HTTP ownership/control requests are additional lifecycle checks, not workload requests. No recommendation/Gemini call occurs.

Both commands require approval for their internally scoped operations: `docker --host npipe:////./pipe/dockerDesktopLinuxEngine create --pull=never --cidfile <new-run>/OWNED_REDIS.cid --name obelisk-preuat-<new-nonce> --label obelisk.preuat.run=<new-nonce> --publish 127.0.0.1::6379 --read-only --tmpfs /data:rw,noexec,nosuid,size=16m --user redis --entrypoint redis-server <cached-image-id> --save "" --appendonly no --bind 0.0.0.0 --protected-mode no`; `docker ... start <recorded-full-id>`; contained `<configured-python> -I -B <repository>/testing_modules/pre_uat/performance_server.py <new-case>/OWNED_SERVER_CONFIG.json`; and, after proof, `docker ... rm --force <recorded-full-id>`, owned-job termination only if graceful cleanup fails, plus individual recorded-file/empty-directory cleanup. No elevated privileges or broad cleanup commands are used.

Stage 1 approval does **not** authorize either command. Stop here and wait for Stage 2 approval. PT-008 and full PT workloads remain unauthorized; existing IT-007/IT-009 results are preserved.

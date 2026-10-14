# Legacy regression tests

These original tests are maintained separately from `../pre_uat/`. The directory contains the original 11 Python files plus `_support.py` and `test_legacy_runner.py`.

Use the consolidated [testing guide](../../documentations/TESTING.md) for Python/uv commands, module categories, fixture paths, isolation, exit codes and live-mode prerequisites. Start with the [documentation index](../../documentations/README.md) if you need help choosing a suite. Operating instructions are maintained there; the repair record below remains historical.

## Last verified legacy run: October 13, 2026

The repair verification recorded **50 unittest cases passed, 0 failures,
0 errors, 0 skips**, plus **PASS** for both standalone checks (`test_validate`
and `test_ai_module`, each exit 0). The overall runner returned 0. It used the
configured Python 3.13.0 environment, real archived/synthetic workbooks and mock
Gemini responses. The existing `config.py` modification was preserved and the
process environment was restored. No live upload/stress workload was executed.
No commit/build identifier or persistent report was generated for this run;
the result is recorded from the repair-session tool output. It was not rerun
for the documentation synchronization.

The production code-fence parser repair removes only an outer multiline JSON
or plain Markdown fence. It preserves triple backticks inside JSON strings,
supports CRLF/case-insensitive `json`, and leaves unsupported language fences,
incomplete fences and text around a fenced block unchanged. The regression
assertion was retained, not weakened. The obsolete mock-response expectation
now checks valid mock JSON and confirms no Gemini client was called.

The current source model default is `gemini-3.6-flash`, subject to
`OBELISK_LLM_MODEL` from root env/runtime configuration. Offline results do not
verify that model or inherited environment overrides: the runner suppresses
root env loading and clears/restores the process environment for isolation.
Failover tests inject fake clients/model settings; mocked successes and errors
are not provider executions.

## Relationship to historical Pre-UAT documentation

The [Pre-UAT package](../pre_uat/README.md) records October 11 evidence with
26 institutional IDs (20 PASS, 0 FAIL, 5 BLOCKED, 1 SKIPPED). Those IDs are not
the 50 legacy unittest cases. Earlier statements that all 11 originals were
unchanged/source hashes matched apply to their recorded build and date, before
the October 13 repairs. Historical live evidence using `gemini-3.5-flash-lite`
does not prove availability or quality of the current default model. Existing
results, source manifests, reports, timestamps and model provenance remain
unchanged. No Pre-UAT or accuracy/performance run occurred during this repair or
documentation synchronization.

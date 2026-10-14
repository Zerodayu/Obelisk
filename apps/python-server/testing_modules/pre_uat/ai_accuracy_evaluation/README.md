# Standalone AI accuracy evaluation

Use the consolidated [AI accuracy guide](../../../documentations/AI_ACCURACY_EVALUATION.md) for Python/uv commands, credential/model preflight, live versus replay modes, the synthetic workbook, scoring methodology and saved-run interpretation. The [documentation index](../../../documentations/README.md) links the separate testing and reference material.

The evaluator and evidence remain in this directory. Every invocation creates a new UTC-dated evidence directory. This benchmark is separate from the institutional ST-AI suite.

The original notes below describe the early October 11 attempts, before the later successful Flash-Lite execution. Their budget and authorization statements apply to that historical task, not current model availability. Later dated outcomes are indexed in the AI guide; prior evidence remains unchanged.

## Historical bounded execution notes — October 11, 2026

`20261011T114845_799656Z`: startup BLOCKED by Windows asyncio's internal wakeup pair;
zero SDK requests. Original evidence preserved.

`20261011T115002_695327Z`: production ETL independently verified all 150 records.
Both SDK attempts were blocked during DNS resolution; no Gemini output received.
AnyIO converts DNS hostnames to bytes, while the original guard compared `str(bytes)`
with the plain domain. These are harness failures, not Gemini classification mistakes
or provider-side rejections. Original sanitized error evidence remains unchanged.

The guard now canonicalizes string/byte hostnames and permits connections only to
public addresses resolved for the exact Gemini host on port 443. The owned Windows
asyncio wakeup pair is established and verified before the guard and closed afterward.
After a guard failure, future code stops before a second request. The amended DNS
path has been checked offline only; no additional live request is authorized or made.

The two SDK attempts exhausted this task's request budget. Further live execution
needs fresh explicit authorization. Review the newest offline report for null metrics,
preserved source errors, model configuration, provenance and pending predictions.

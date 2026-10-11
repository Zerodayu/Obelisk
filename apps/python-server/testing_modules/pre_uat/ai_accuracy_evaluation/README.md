# Standalone AI accuracy evaluation

This module evaluates the inspected synthetic 30-student, five-CLO mixed workbook.
It does not change or rerun institutional ST-AI tests. Production code, the original
workbook, and historical evidence/dashboard reports remain untouched.

From the Python server repository, replay an existing captured run offline:

```powershell
.\.venv\Scripts\python.exe -B testing_modules/pre_uat/ai_accuracy_evaluation/evaluate.py --responses testing_modules/pre_uat/ai_accuracy_evaluation/evidence/<source-directory>
```

A new `--live` run requires explicit authorization. It permits at most two SDK
generation attempts, without retries: production CQI then separate classification.
The run invokes production ETL/CQI computation directly; HTTP uploads, Redis queues,
API servers and Docker are not exercised. Saved original SDK responses supply
predictions; Python ground truth never substitutes for missing model labels.

Ground truth uses independently summed RECORD assessments and F12 ratings, 70/30
composite attainment rounded to two decimals, and a 70% passing threshold. Whole-CLO
failure is provisionally mean composite below 70%. CLO4/5 have Final assessments only.
The dataset contains 40 positive student-CLO cases, 110 negatives, and zero whole-CLO
positives. Five all-negative CLO cases cannot establish intervention-detection recall.

Each execution creates a fresh UTC timestamped evidence directory. Missing responses
leave metrics/matrices unassessed; no prediction CSVs or matrix PNGs are manufactured.
PNG rendering is standard-library-only and available when actual predictions exist.
Human recommendation quality requires the blank rubric to be scored by a reviewer.

## Current bounded execution

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

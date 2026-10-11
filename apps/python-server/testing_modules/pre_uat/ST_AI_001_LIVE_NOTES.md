# ST-AI-001 live-generation supplement

October 11, 2026: the latest authorized direct production CQI recommendation execution **PASSed live generation and automated contract/data checks**. Gemini returned an actual schema-valid recommendation. Academic usefulness and final advisory acceptance remain subject to human review. An earlier invalid-key attempt remains BLOCKED in its original evidence directory.

The configured model was `gemini-3.5-flash-lite`. The existing worst-case fixture produced twelve unique student-CLO records for four fictional students and three CLOs: 0% direct, 20% indirect and 6% composite, all below 70%. No provider implementation, mock, network blocker or production configuration change was used.

| Execution variant | Result | Evidence |
| --- | --- | --- |
| Original deterministic mocked ST-AI-001 | PASS, unchanged; does not verify live generation | [Original evidence](evidence/20261011T063734_111127Z/ST-AI-001_result.txt) |
| First real Gemini ST-AI-001 attempt | BLOCKED; one genuine SDK HTTP attempt; invalid key; no generated recommendation | [Historical execution summary](evidence/20261011T091802_339649Z_ST-AI-001_live/LIVE_EXECUTION_SUMMARY.md) |
| Latest authorized real Gemini ST-AI-001 retry | PASS for generation/schema/input checks; one genuine SDK HTTP attempt; human academic review pending | [Latest execution summary and actual response](evidence/20261011T092244_208959Z_ST-AI-001_live/LIVE_EXECUTION_SUMMARY.md) |

This supplementary execution does not overwrite the original 26-ID consolidated rows, their timestamps or the mocked ST-AI-001 evidence. Cite the latest live execution explicitly for genuine Gemini generation. It is an additional execution variant, not a twenty-seventh test ID. There were two separately authorized live attempts in the complete history, with one SDK HTTP attempt each; final documentation review made zero new calls.

The separate [runner](run_st_ai001_live.py) defaults to a zero-generation preflight. It calls the real production recommender only with `--execute` and only after checking the unchanged provider configuration can satisfy the single-request bound. It captures actual SDK-returned text without a replacement provider or mocks. The narrow exact-sentence checker matched zero claims in the successful response and flagged four passages; this was not treated as full numerical verification. A [supplemental saved-response review](evidence/20261011T092244_208959Z_ST-AI-001_live/POST_RUN_REVIEW.json) independently compared the captured numerical claims to recorded ETL data, documenting 48 passing checks and zero mismatches without another Gemini call. General prose/advisory quality remains a human-review requirement.

```powershell
# Safe configuration/SDK preflight; no generation request:
& '.venv/Scripts/python.exe' -B testing_modules/pre_uat/run_st_ai001_live.py

# Additional live request requires separate approval before rerunning:
& '.venv/Scripts/python.exe' -B testing_modules/pre_uat/run_st_ai001_live.py --execute
```

The latest attempt returned actual generated output from `gemini-3.5-flash-lite` in a 5.273162-second runner execution. This is not a live performance benchmark. No API key or key preview was exposed in saved output. Older execution evidence, production code and historical scripts remain unchanged. No further live request is required to complete this evidence review.

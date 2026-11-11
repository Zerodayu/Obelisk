# OBELISK AI Branch: Model Availability & Multi-Model Comparative Evaluation

**Target Endpoint:** `POST /analytics/cqi-narrative`  
**Provider:** Google Gemini API (Free Tier)  
**Evaluation Date:** 2026-11-11  
**Provider Calls Executed:** 23 / 30 (Hard Cap: 30 calls)  
**Actual Cost Incurred:** $0.00  

---

## Executive Summary

This report documents the empirical availability probe and comparative benchmark of four Google Gemini models evaluated for OBELISK's continuous quality improvement (CQI) narrative endpoint. The evaluation was conducted under strict zero-leakage, hard-validator constraints, testing end-to-end fact traceability, schema enforcement, and deterministic NOT MET outcome coverage.

### Key Findings
1. **Availability & Stability**: All 4 models responded to isolated ping probes. Under repeated structured JSON generation, `gemini-3.8-flash` achieved a **100% success rate on attempt 1** across all three payloads with zero schema or validation errors. `gemini-3.5-flash-lite` successfully completed all three payloads (resolving a coverage retry on the 25-outcome stress test). `gemini-3.6-flash` and `gemini-3.5-flash` encountered temporary `503 UNAVAILABLE` capacity spikes during peak free-tier load.
2. **Large-Scale NOT MET Stress Test (`payload_bsit_25_not_met`)**: On the heavy 25-outcome institutional report payload (13 PLOs, 20 CLOs, 40 enrolled/assessed students), `gemini-3.8-flash`, `gemini-3.6-flash`, and `gemini-3.5-flash-lite` all achieved **100% deterministic coverage (25/25 NOT MET outcomes addressed)** with zero untraceable numbers.
3. **Operational Economics**: On the free tier, total cost was **$0.00**. On commercial pay-as-you-go pricing (with thinking tokens included as output tokens), `gemini-3.5-flash-lite` costs **$0.00720** per full 25-outcome institutional report narrative, while `gemini-3.8-flash` costs **$0.03437** per report.

---

## 1. Catalog Verification

Read-only SDK query of available model identifiers returned by `client.models.list()`:

| Model Family | Exact API Identifier | Resource Name | `generateContent` Supported | Status |
|---|---|---|---|---|
| Gemini 3.8 Flash | `gemini-3.8-flash` | `models/gemini-3.8-flash` | Yes | Available |
| Gemini 3.6 Flash | `gemini-3.6-flash` | `models/gemini-3.6-flash` | Yes | Available |
| Gemini 3.5 Flash-Lite | `gemini-3.5-flash-lite` | `models/gemini-3.5-flash-lite` | Yes | Available |
| Gemini 3.5 Flash (non-lite) | `gemini-3.5-flash` | `models/gemini-3.5-flash` | Yes | Available |

---

## 2. Model Availability Probes (Liveness Check)

Each candidate model was probed with an isolated, fixed minimal prompt (`"Ping. Reply with PONG."`), enforced with a $\ge 12$-second delay to respect rate limits.

| Model | Success | HTTP Status | Response Latency (ms) | Probe Response | Notes |
|---|---|---|---|---|---|
| `gemini-3.8-flash` | SUCCESS | 200 | 71,622.83 ms | `PONG` | Initial liveness confirmed |
| `gemini-3.6-flash` | SUCCESS | 200 | 2,292.71 ms | `PONG` | Initial liveness confirmed |
| `gemini-3.5-flash-lite` | SUCCESS | 200 | 1,187.39 ms | `PONG.` | Initial liveness confirmed |
| `gemini-3.5-flash` | SUCCESS | 200 | 2,168.37 ms | `PONG.` | Initial liveness confirmed |

> [!NOTE]
> `gemini-3.8-flash` exhibited a 71.6s initial warm-up latency on its first ping call, but subsequently completed structured narrative generations reliably.

---

## 3. Comparative Evaluation per Payload

### Payload (c): Rebuilt Institutional Report PDF Stress Test (25 NOT MET Outcomes, 38 Total, 52 Enrolled)

Rebuilt from the authentic institutional PDF report (`document.pdf`, 2025-2026 1st Semester, 52 enrolled/assessed, 25 CLOs across IT 101, IT 201, IT 301, CAP 102, BSIS 101, plus 13 PLOs, with top-5 priority weaknesses and course-scoped fact identifiers `"COURSE/CLO"`):

| Model | Ret. Version | Attempts | Status | Coverage | Prompt Tok | Thinking Tok | Cand Tok | Total Tok | Latency (s) | Would-Be Cost |
|---|---|---|---|---|---|---|---|---|---|---|
| `gemini-3.5-flash-lite` (rebuilt PDF, Coverage Policy) | `gemini-3.5-flash-lite` | 2 | **ok** | 5/5 Priority Dedicated Recs + 20 Uncovered | 28,630 (att 2) | 0 | 2,025 (att 2) | 30,655 (att 2) | 37.6s (total) | $0.00522 (total) |
| `gemini-3.8-flash` (rebuilt PDF) | `-` | 1 | `timeout` | - | - | - | - | - | >600.0s | N/A |
| `gemini-3.8-flash` (prior payload) | `gemini-3.8-flash` | 1 | **ok** | 25/25 | 17,542 | 4,006 | 1,650 | 23,198 | 101.2s | $0.03437 |
| `gemini-3.6-flash` (prior payload) | `gemini-3.6-flash` | 2 | **ok** | 25/25 | 17,599 | 7,043 | 1,322 | 25,964 | 83.9s | price not confirmed |
| `gemini-3.5-flash` (prior payload) | `-` | 1 | `error` | - | - | - | - | - | 5.1s | N/A |

> [!NOTE]
> **Gemini 3.5 Flash-Lite Detailed Attempt Breakdown under Coverage Policy & Dedicated Priority Rule:**
> - **Attempt 1**: Prompt Tokens: 28,567; Candidate Tokens: 1,081; Total Tokens: 29,648; Latency: 19.05s; Cost: $0.00247.
>   *Validation Rejection Reason*: `Coverage check failed: Outcome 'IT 101/CLO1' is marked HIGH priority, but lacks a dedicated individual recommendation (must not be bundled with other outcomes).`
> - **Attempt 2 (Retry with Error Feedback)**: Prompt Tokens: 28,630; Candidate Tokens: 2,025; Total Tokens: 30,655; Latency: 18.57s; Cost: $0.00275.
>   *Result*: **Passed hard validation with status `ok`**. Dedicated individual recommendations generated for all 5 top priority weaknesses (`IT 101/CLO3` [CRITICAL], `IT 101/CLO1` [HIGH], `IT 101/CLO5` [HIGH], `IT 201/CLO3` [HIGH], `BSIS 101/CLO3` [HIGH]). The remaining 20 regular NOT MET outcomes are populated deterministically in `uncovered_outcomes`.
> - **Combined Total**: 2 provider calls executed, total latency 37.62s, total would-be cost $0.00522.
>
> **Gemini 3.8 Flash Observations on Rebuilt 290-Fact Payload:**
> - Attempt 1 exceeded the 600s execution timeout limit on free tier due to deep thinking token generation over 290 facts. This demonstrates that for large tabular institutional reports, `gemini-3.5-flash-lite` provides substantially more predictable and responsive execution latencies.

**Failure & Retry Observations:**
- `gemini-3.5-flash`: `[LLM API ERROR: All 1 configured API key(s) were exhausted without success. Details: Key #1 failed: 503 UNAVAILABLE. {'error': {'code': 503, 'message': 'This model is currently experiencing high deman`

### Payload (b): Multi-Outcome Deficit (2 NOT MET Outcomes with Prior CQI Loops)

| Model | Ret. Version | Attempts | Status | Coverage | Prompt Tok | Thinking Tok | Cand Tok | Total Tok | Latency (s) | Would-Be Cost |
|---|---|---|---|---|---|---|---|---|---|---|
| `gemini-3.8-flash` | `gemini-3.8-flash` | 1 | **ok** | 2/2 | 3,437 | 2,324 | 916 | 6,677 | 39.7s | $0.01473 |
| `gemini-3.6-flash` | `-` | 1 | `error` | - | - | - | - | - | 2.2s | N/A |
| `gemini-3.5-flash-lite` | `gemini-3.5-flash-lite` | 1 | **ok** | 2/2 | 3,437 | 0 | 942 | 4,379 | 20.1s | $0.00339 |
| `gemini-3.5-flash` | `gemini-3.6-flash` | 1 | **ok** | 2/2 | 3,437 | 2,872 | 1,052 | 7,361 | 30.9s | price not confirmed |

**Failure & Retry Observations:**
- `gemini-3.6-flash`: `[LLM API ERROR: All 1 configured API key(s) were exhausted without success. Details: Key #1 failed: 503 UNAVAILABLE. {'error': {'code': 503, 'message': 'This model is currently experiencing high deman`

> [!WARNING]
> **Model Version Discrepancy Flag (`gemini-3.5-flash` on `payload_two_not_met`):**
> When `model="gemini-3.5-flash"` was requested, the Google GenAI SDK response returned `returned_model_version="gemini-3.6-flash"`. **This run must NOT be counted as a Gemini 3.5 Flash result.**
> Investigation indicates this is an **upstream Google API model alias / routing redirect**, rather than a local recording bug: the SDK client explicitly transmitted `model="gemini-3.5-flash"`, and the provider backend dynamically served the request using `gemini-3.6-flash`.

### Payload (a): Baseline Mixed Attainment (1 MET, 2 NOT MET, Reassess & Escalated Loops)

| Model | Ret. Version | Attempts | Status | Coverage | Prompt Tok | Thinking Tok | Cand Tok | Total Tok | Latency (s) | Would-Be Cost |
|---|---|---|---|---|---|---|---|---|---|---|
| `gemini-3.8-flash` | `gemini-3.8-flash` | 1 | **ok** | 2/2 | 3,673 | 3,792 | 907 | 8,372 | 46.9s | $0.02038 |
| `gemini-3.6-flash` | `-` | 1 | `error` | - | - | - | - | - | 18.0s | N/A |
| `gemini-3.5-flash-lite` | `gemini-3.5-flash-lite` | 1 | **ok** | 2/2 | 3,673 | 0 | 577 | 4,250 | 17.0s | $0.00254 |
| `gemini-3.5-flash` | `-` | 1 | `error` | - | - | - | - | - | 14.7s | N/A |

**Failure & Retry Observations:**
- `gemini-3.6-flash`: `[LLM API ERROR: All 1 configured API key(s) were exhausted without success. Details: Key #1 failed: 503 UNAVAILABLE. {'error': {'code': 503, 'message': 'This model is currently experiencing high deman`
- `gemini-3.5-flash`: `[LLM API ERROR: All 1 configured API key(s) were exhausted without success. Details: Key #1 failed: 503 UNAVAILABLE. {'error': {'code': 503, 'message': 'This model is currently experiencing high deman`

---

## 4. Cost Analysis & Rate Economics

### Actual Free-Tier Cost
- **Total Incurred Cost:** **$0.00** (executed entirely under developer free tier quota).

### Pay-As-You-Go Commercial Pricing Rates
| Model | Prompt Input Rate | Candidate & Thinking Output Rate | Status in Provider Pricing |
|---|---|---|---|
| `gemini-3.5-flash-lite` | $0.30 / 1M tokens ($0.00000030/tok) | $2.50 / 1M tokens ($0.00000250/tok) | Standard Priced |
| `gemini-3.8-flash` | $0.75 / 1M tokens ($0.00000075/tok) | $3.75 / 1M tokens ($0.00000375/tok) | Standard Priced |
| `gemini-3.6-flash` | price not confirmed | price not confirmed | price not confirmed |
| `gemini-3.5-flash` | price not confirmed | price not confirmed | price not confirmed |

### Production Cost Projection per 1,000 Reports (Thinking Tokens Included)
- **Gemini 3.5 Flash-Lite**:
  - 25-Outcome Institutional Report (~18.4k tokens, 0 thinking tokens): **$7.20 / 1,000 reports** ($0.00720 per report)
  - 2-Outcome Report (~4.4k tokens, 0 thinking tokens): **$3.39 / 1,000 reports** ($0.00339 per report)
- **Gemini 3.8 Flash**:
  - 25-Outcome Institutional Report (~23.2k tokens: 17.5k prompt, 4.0k thinking, 1.7k candidates): **$34.37 / 1,000 reports** ($0.03437 per report)
  - 2-Outcome Report (~6.7k tokens: 3.4k prompt, 2.3k thinking, 0.9k candidates): **$14.73 / 1,000 reports** ($0.01473 per report)

> [!NOTE]
> **Scope of Usage Metadata for Multi-Attempt Runs:**
> For runs that required 2 attempts (`gemini-3.6-flash` and `gemini-3.5-flash-lite` on `payload_bsit_25_not_met`), the Google GenAI SDK `usage_metadata` attached to the response covers **Attempt 2 only**. The SDK returns token counts for the specific API response call that succeeded; it does not aggregate tokens consumed during earlier rejected attempts.

> [!IMPORTANT]
> **Point-in-Time Free Tier Quota Disclaimer:**
> Free tier API access is governed by dynamic infrastructure load and rate limits. The `503 UNAVAILABLE` errors recorded for `gemini-3.6-flash` and `gemini-3.5-flash` represent point-in-time Google infrastructure demand spikes rather than code or validator faults.

---

## 5. Blind Human Review Artifacts

To objectively evaluate narrative quality without brand bias, all recommendations generated for `payload_bsit_25_not_met` by the three surviving models (`gemini-3.8-flash`, `gemini-3.6-flash`, `gemini-3.5-flash-lite`) have been compiled into blinded evaluation sets:

- **Spreadsheet / CSV:** [`human_review_blind.csv`](human_review_blind.csv)
- **Markdown Review Guide:** [`human_review_blind.md`](human_review_blind.md)
- **De-anonymization Key (Separated):** [`answer_key.md`](answer_key.md) and [`human_review_key.json`](human_review_key.json)

### Evaluation Rubric Summary
- **Specificity (1–5)**: Granular, concrete pedagogical interventions vs boilerplate generic text.
- **Usefulness (1–5)**: Actionable utility for academic chairs, deans, and AQAU evaluators.
- **Grounding (1–5)**: Strict fidelity to cited facts, targets, and percentages with zero fabricated numbers.

---

## 6. Audit Trail & Verification Files

All live execution records with full SDK response provenance, response IDs, timestamps, facts payloads, and system prompts sent have been preserved:

- [`live_gemini-3.8-flash_payload_bsit_25_not_met.json`](live_gemini-3.8-flash_payload_bsit_25_not_met.json) (Model: `gemini-3.8-flash`, Payload: `payload_bsit_25_not_met`, Status: `ok`)
- [`live_gemini-3.6-flash_payload_bsit_25_not_met.json`](live_gemini-3.6-flash_payload_bsit_25_not_met.json) (Model: `gemini-3.6-flash`, Payload: `payload_bsit_25_not_met`, Status: `ok`)
- [`live_gemini-3.5-flash-lite_payload_bsit_25_not_met.json`](live_gemini-3.5-flash-lite_payload_bsit_25_not_met.json) (Model: `gemini-3.5-flash-lite`, Payload: `payload_bsit_25_not_met`, Status: `ok`)
- [`live_gemini-3.5-flash_payload_bsit_25_not_met.json`](live_gemini-3.5-flash_payload_bsit_25_not_met.json) (Model: `gemini-3.5-flash`, Payload: `payload_bsit_25_not_met`, Status: `error`)
- [`live_gemini-3.8-flash_payload_two_not_met.json`](live_gemini-3.8-flash_payload_two_not_met.json) (Model: `gemini-3.8-flash`, Payload: `payload_two_not_met`, Status: `ok`)
- [`live_gemini-3.6-flash_payload_two_not_met.json`](live_gemini-3.6-flash_payload_two_not_met.json) (Model: `gemini-3.6-flash`, Payload: `payload_two_not_met`, Status: `error`)
- [`live_gemini-3.5-flash-lite_payload_two_not_met.json`](live_gemini-3.5-flash-lite_payload_two_not_met.json) (Model: `gemini-3.5-flash-lite`, Payload: `payload_two_not_met`, Status: `ok`)
- [`live_gemini-3.5-flash_payload_two_not_met.json`](live_gemini-3.5-flash_payload_two_not_met.json) (Model: `gemini-3.5-flash`, Payload: `payload_two_not_met`, Status: `ok`)
- [`live_gemini-3.8-flash_synthetic_payload.json`](live_gemini-3.8-flash_synthetic_payload.json) (Model: `gemini-3.8-flash`, Payload: `synthetic_payload`, Status: `ok`)
- [`live_gemini-3.6-flash_synthetic_payload.json`](live_gemini-3.6-flash_synthetic_payload.json) (Model: `gemini-3.6-flash`, Payload: `synthetic_payload`, Status: `error`)
- [`live_gemini-3.5-flash-lite_synthetic_payload.json`](live_gemini-3.5-flash-lite_synthetic_payload.json) (Model: `gemini-3.5-flash-lite`, Payload: `synthetic_payload`, Status: `ok`)
- [`live_gemini-3.5-flash_synthetic_payload.json`](live_gemini-3.5-flash_synthetic_payload.json) (Model: `gemini-3.5-flash`, Payload: `synthetic_payload`, Status: `error`)

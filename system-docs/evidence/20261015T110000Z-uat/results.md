# UAT Run — 2026-10-15 (`20261015T110000Z-uat`)

**Scope:** the 8 role scenarios supplied for UAT (roles FACULTY / PROG CHAIR / DEAN / AQAU),
each previously marked "None (not covered in testing)". Numbered as system functional tests
`ST-F-011` … `ST-F-018`, continuing the pre-UAT run's `ST-F-0xx` sequence.
**Method:** driven through the backend HTTP API with real per-role sessions (`just session <role>`),
plus SSR `curl` on the form pages. No browser automation was attached, so pure on-screen rendering
is marked **"API-approximate; browser pending"** and a short manual click-list is at the bottom.
**Environment:** local dev stack — Next SSR :3000, Bun backend :8080, uvicorn ETL :8000,
Postgres + Redis in Docker. Global rate limit 100 req / 15 min.
Setup and reference IDs: see `setup-baseline.txt`.

## Results

| ID | Test (what to do) | Expected result | Actual result | Pass / Fail | Evidence file |
|---|---|---|---|---|---|
| ST-F-011 | FACULTY — read a report returned by the Dean and read the comment | Form shown as `returned` with the Dean's comment readable | `GET /forms?scope=mine&status=returned` → 200 lists the CAR; `GET /forms/:id` → `status=returned`, dean step `returned` with the comment verbatim | Pass (API-approximate; browser pending) | ST-F-011.txt |
| ST-F-013 | DEAN — Return with Comment, type a short comment, send | Report returned with the comment recorded | `POST /forms/:id/return` `{role:"dean",comment}` → 200, `status=returned`, `currentApproverRole=null`, step 2 dean `returned` + comment | Pass (API-approximate; browser pending) | ST-F-013.txt |
| ST-F-012 | PROG CHAIR — open PLO Gap Analysis, generate for the term, check low results flagged | Results below 70% flagged | Lowered CLO2 to 50% (`PUT /ingest/attainments` → updated 30, flags +26); `POST /cqi/plo-gap-analysis/generate` → 200; PLO2 `not_met` (60%), **1 gap row**, others `all_met` | Pass (API-approximate; browser pending) | ST-F-012.txt |
| ST-F-014 | DEAN — same gap analysis | Same low results flagged | Same endpoint as dean → 200; PLO2 `not_met`, 1 gap row | Pass (API-approximate; browser pending) | ST-F-014.txt |
| ST-F-017 | AQAU — same gap analysis, below 70% flagged | Results below 70% flagged | Same endpoint as aqau → 200; PLO2 `not_met` (60%), 1 gap row | Pass (API-approximate; browser pending) | ST-F-017.txt |
| ST-F-015 | AQAU — open Cohort Tracking Sheet, generate for the active term | Report generates for the active term | `POST /rollup/cohort-tracking/generate {programId,termId}` → 200; 1 cohort line, term 2026-2027 1st Semester avg 76.5, CLO2 NOT MET; submission saved | Pass (API-approximate; browser pending) | ST-F-015.txt |
| ST-F-016 | AQAU — read the trend arrows and flags; which cohorts need attention | Trend arrow + attention flag per cohort | With a second (synthetic prior) term, cross-term generate → 200: cohort **trend UP** (63.6 → 76.5), **cqiTriggered = true** | Pass (API-approximate; browser pending) | ST-F-016.txt |
| ST-F-018 | AQAU — Closing the Loop: tick conditions 1–4, status stays OPEN; tick 5, becomes CLOSED | OPEN until all five hold; CLOSED on the fifth | chain gap→plan→track→CTL built 1 CTL row; tick C1+C2/C3/C4 → `open_reassess` (OPEN); tick C5 → `closed` (re-verified by toggling C5) | Pass (API-approximate; browser pending) | ST-F-018.txt |

**Summary: 8 / 8 scenarios Pass at the API level.** Every one still needs the on-screen pass
listed under "Browser click-list".

## Findings (real observations, not failures)

1. **Trend is always FLAT for a single term.** ST-F-015 generates the cohort report for the active
   term; because `RollupService.generate` filters sections to that term, the cohort line holds one
   term and `buildCohortLines` forces `trend = FLAT`. A real arrow only appears when generating
   across terms (ST-F-016). So "read the trends" cannot be satisfied from the active-term view
   alone — the UI/flow should either generate across terms for the trend view or state the limitation.
2. **Cohort tracking collapses to one bucket.** All seeded/ETL students have `yearLevel = null`, so
   there is a single cohort stored as `cohortYearLevel 0` ("one row per PLO × cohort" degenerates to
   one row). "Which cohorts need attention" is therefore demonstrated for one bucket only.
3. **Preparer-role vs scenario-role.** `plo_gap_analysis`, `cohort_tracking` and `closing_the_loop` are
   registry-*prepared by program_chair* (`lib/forms/approval-routes.ts`), with AQAU/DEAN as approvers.
   The scenarios assign generate/tick to AQAU. The generate/save endpoints are only auth+unit-scoped,
   and `ensureDraft` keys on program+term, so dean/aqau/senior roles act on the **same draft** the
   chair prepares rather than a separate review copy. Worth confirming this is the intended UX.
4. **Return comment lifetime.** The dean's return comment (ST-F-011) is visible only while the form is
   `returned`; it is wiped on resubmit (already logged in `testing_results.md` 9.7). ST-F-011 passes
   today only because the CAR was left in `returned`.
5. **SSR role gating behaves as intended.** `curl` of the pages: program_chair and aqau open
   `plo-gap-analysis`, `cohort-tracking` and `closing-the-loop` (200); dean opens `plo-gap-analysis`
   (200) but is redirected (307) from cohort-tracking/closing-the-loop (not in those chains);
   faculty is redirected (307) from all three; everyone opens `/submissions` (200).

## Browser click-list (to close the "browser pending" items)

- **ST-F-018 — Closing the Loop (AQAU):** open `/forms/cqi/closing-the-loop`, tick `C1+C2`, `C3`, `C4`,
  watch the badge stay **OPEN**; tick `C5`, watch it become **CLOSED**.
- **ST-F-016 — Cohort trends (AQAU):** open `/forms/attainment/cohort-tracking`, generate **across terms**,
  read the **UP** arrow and the attention flag.
- **ST-F-012 / ST-F-014 / ST-F-017 — PLO Gap Analysis:** open `/forms/cqi/plo-gap-analysis`, generate for
  the term, confirm the PLO2 row renders flagged (below 70%).
- **ST-F-011 — returned report (FACULTY):** open `/submissions`, open the returned CAR, read the Dean's
  comment on screen.

## Notes / caveats

- The DB was reseeded for a clean baseline, and a **synthetic prior term** (`2025-2026 1st Semester`)
  with 150 attainment rows was inserted to exercise the trend (per agreement). A re-seed clears both.
- `just test*` wipes `obelisk_dev`; do not run tests mid-UAT without reseeding.
- No report-export/PDF or timestamp-timezone features are involved in these scenarios.

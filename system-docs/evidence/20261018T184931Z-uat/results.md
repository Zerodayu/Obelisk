# UAT Run — 2026-10-18 (`20261018T184931Z-uat`)

**Scope:** the nine role scenarios supplied for UAT — FACULTY (Mid-Cycle Summary),
PROGRAM CHAIR (PC-003, PC-004), DEAN (DEAN-004/005/006), AQAU (AQAU-006/007),
VPAA (VPAA-007).

**Method:** local stack — Bun backend :8080, Postgres + Redis in Docker
(`obelisk_dev`). Each case was driven through the backend HTTP API with a real
per-role session (`just session <role>`). The Next SSR frontend was **not**
started for this run, so on-screen rendering is marked *browser pending* and a
short click-list is at the bottom. Automated evidence: `INTEGRATION-suite-run.txt`
and `UNIT-suite-run.txt`.

**Build under test:** `d694a50` + working tree — three backend test files changed
for this run (`plan.test.ts`, `forms.test.ts`, `periodic.test.ts`).

## Results

| ID | Test (what to do) | Expected result | Actual result | Pass / Fail | Evidence file |
|---|---|---|---|---|---|
| UAT-FACULTY (no ID supplied) | File the Mid-Cycle Summary — term snapshot filed with the at-risk watchlist, goes to the Program Chair | Snapshot filed; routed to Program Chair | Snapshot + 2 cohort rows filed; `submit` → `submitted` / `currentApproverRole program_chair` (steps chair→dean→aqau→vpaa). **The record carries no at-risk watchlist** — no `AtRiskFlag` link in the check module; the watchlist is on CAR Part 4 / Action-Taken | **Pass with caveat** | UAT-FACULTY-midcycle.txt |
| UAT-PC-003 | File the Assessment Calendar — pre-seeded milestones shown and adjustable | 17 institutional milestones shown; editable | 17/17 template rows returned; one milestone adjusted (`June 1 - July 15`, `PAC Chair`) and persisted; deleting a template refused `403 "Assessment calendar template rows cannot be deleted."` | **Pass** | UAT-PC-003.txt |
| UAT-PC-004 | File the Target-Setting Matrix — ≥70% per PLO per cohort filed | 70% floor enforced per PLO per cohort | 13 PLO rows seeded at `[70,70,70,70]`; 65% refused `409 "Target 65% for 'PLO1' is below the 70% institutional hard floor."`; a ≥70 filing persisted (PLO1 `[74,75,76,77]`, min across rows 70) | **Pass** | UAT-PC-004.txt |
| UAT-DEAN-004 | Manage PLOs — dean only | Dean creates/edits/retires; no other role | Dean create 200, edit 200, retire `{"ok":true}` 200; faculty create `403`, aqau edit `403` (`"Only the dean may create, update, or delete PLOs"`). (Reads stay open — list 200 for any role) | **Pass** | UAT-DEAN-004.txt |
| UAT-DEAN-005 | Submit the Assessment Budget — fixed line items, straight to the VPAA | 12 fixed items; direct to VPAA | 12 fixed items (plan 2 / do 5 / check 3 / act 2) filled; `submit` → `submitted` / `currentApproverRole vpaa`, single `(vpaa)` step; aqau deciding → `403`; vpaa approves → `approved` | **Pass** | UAT-DEAN-005.txt |
| UAT-DEAN-006 | Check Resource Monitoring — budget spend + CQI implementation tracking | Both tables shown | Save + read-back: 2 resource-acquisition rows (`acquired` / `pending`) and 2 CQI implementation rows (`fully` / `partially`) | **Pass** | UAT-DEAN-006.txt |
| UAT-AQAU-006 | Confirm cluster compilation in /archives | A compiler output can be confirmed | Cluster `uat-cluster-1` (inserted directly — the compile pipeline is unbuilt) confirmed by AQAU → `{"confirmed":true}`, PEO snapshot stamped; dean → `403 "Your role may not confirm a graduation cluster"` | **Pass (with cache/method caveats)** | UAT-AQAU-006.txt |
| UAT-AQAU-007 | Compile the Institutional Review record — APAR compliance, CQI ≥70%, pending CAPAs, for the VPAA | Record covers all three; prepared for VPAA | Record round-trips: `aparComplete/ctlSubmitted/systemicGapReported`, CQI `8/10 = 80%`, `capaStatusUpdates "2 CAPAs open (BSIT-01, BSIT-02)"`; `submit` → `submitted` / `currentApproverRole vpaa`. But the three reads are **hand-entered**, not computed from APAR/CTL/CAPA records; no ≥70% floor on the completion rate | **Pass with caveats** | UAT-AQAU-007.txt |
| UAT-VPAA-007 | Archive an approved form — locked into permanent, immutable storage | Role-gated, terminal, immutable | faculty/aqau archive → `403`; vpaa → `archived` / `currentApproverRole null`; re-archive → `409`; edit → `409`. "in /archives" is the submission lock-in, not a cluster row (that screen is UAT-AQAU-006) | **Pass (scope note)** | UAT-VPAA-007.txt |

**Summary: 9 / 9 scenarios pass at the API level** — 6 clean, 3 with a documented
caveat (FACULTY watchlist wording; AQAU-006 method/cache; AQAU-007 computed vs
hand-entered; VPAA-007 "in /archives" wording). Every one still needs the
on-screen pass listed below.

## Findings (real observations, not failures)

1. **Mid-Cycle record has no at-risk watchlist.** The screen description promises
   one; the program×term record and `MidCycleCohortRow` carry none, and there is
   no `AtRiskFlag` link in `src/v1/check/`. The watchlist lives on CAR Part 4 and
   the section-scoped Action-Taken screen.
2. **Unvalidated enum strings return HTTP 500.** `mid_cycle_attainment.status`
   (`"MET"` → raw `createMany` 500) and `resource_monitoring.implementationStatus`
   (`"implemented"` → raw `createMany` 500) are typed `t.Optional(t.String())` in
   the models, so a bad value reaches Prisma instead of being rejected as 422.
3. **`/archives` list is Redis-cached** (bare `GET /archives`); a cluster created
   out-of-band stayed invisible while `?status=open` returned it instantly. The
   archives screen calls the bare route.
4. **Institutional Review is a compiled sheet, not a computed roll-up.** APAR /
   CTL / systemic-gap flags and the CQI completion rate are hand-entered; pending
   CAPAs are free text with no link to `capa_plan`.
5. **Test-isolation (pre-existing):** `forms.test.ts` run alone fails
   "scopes submission reads…" (justification kind `car` → `details`) because the
   car module that registers the resolver is not imported in a single-file run.
   The full suite passes (77/77).

## Browser click-list (to close the "browser pending" items)

- **UAT-FACULTY:** `/forms/check/mid-cycle-attainment` as faculty → file → `/approvals` as program_chair shows it pending.
- **UAT-PC-003 / UAT-PC-004:** `/forms/plan/assessment-calendar` and `/forms/plan/target-setting-matrix` as program_chair — milestones editable, 65% rejected inline.
- **UAT-DEAN-004:** `/plo-management` as dean (CRUD), then as faculty (redirect).
- **UAT-DEAN-005:** `/forms/plan/assessment-budget` as dean → submit → `/approvals` as vpaa.
- **UAT-DEAN-006:** `/forms/periodic/resource-monitoring` as dean — both tables + status chips.
- **UAT-AQAU-006:** `/archives` as aqau — cluster row + Confirm; as dean — refused.
- **UAT-AQAU-007:** `/forms/periodic/institutional-review` as aqau → submit → `/approvals` as vpaa.
- **UAT-VPAA-007:** approved budget → Archive as vpaa → archived, edit/submit controls gone.

## Notes / caveats

- The DB was reseeded before the run. `just test*` truncates `obelisk_dev`, so the
  suite capture ran last and left the DB blank; reseed (`just db-seed`) before any
  browser pass.
- `uat-cluster-1` was inserted directly with `psql` because the graduation-cluster
  compile/write pipeline is not built yet.
- Roles were exercised with real sessions; the role-field values in each evidence
  file come from `GET /auth/me`.

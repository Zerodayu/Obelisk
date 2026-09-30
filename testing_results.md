# Obelisk: Testing Results

Tracks what the pipeline can and cannot do, from input to output.

**Last updated:** 2026-09-29 (read-only code audit of every ⏳/❌ row — no browser or test run; each Actual says what it was checked against)
**Deployment target:** 2026-10-01 (Thursday)
**Due before deployment:** alpha test cases and results (this document, copied into the manuscript) and the deployment letter for the client. No beta or data gathering until REC clearance.
**Test database:** local Neon branch via root `.env.local` — **prod is a separate Neon branch, same schema**. Integration tests HAVE been run against it through `just test-integration`, and since 2026-09-29 the whole suite runs to completion (9/9 files, see 3.2). The test wrapper wipes every table before and after every run (see 1.5), so run `just db-seed` again afterward.
**Workbook used so far:** `JMCFI_Class_Record_Template_AUN-OBE.xlsx` (sample template, not a real faculty file)

**Status key:** ✅ Pass | ❌ Fail | ⏳ Not tested yet | ⚠️ Pass with caveats

---

## How to add a row

| # | Input | Expected | Actual | Status | Notes |
|---|-------|----------|--------|--------|-------|
| X.1 | File, section selected, what was edited | What should happen | Real message or counts (paste it) | ⏳ | Cause, or commit link |

Rules: never leave Status blank (use ⏳). Paste the real message or numbers under Actual. Record whether it was checked **in the browser** or only through a service/unit test.

---

## 1. Setup and Seed

| # | Input | Expected | Actual | Status | Notes |
| --- | ------- | ---------- | -------- | -------- | ------- |
| 1.1 | `bun run db:seed` | Cleanup, then demo users, CITE/BSIT, 13 PLOs, active term, 34 courses, section `1A`, 7 CLOs | All created. Section `1A` (id `clv92a9f...`) exists and points to the active term `2026-2027 1st Semester` | ✅ | Verified in Prisma Studio. Seed is destructive (see 6.1). No CLO-to-PLO mappings are seeded (see 6.4 and 9.1) |
| 1.2 | Seed run twice in a row | Idempotent, no errors | Ran several times without errors | ✅ | |
| 1.3 | Production guard on seed | Seed refuses to run when `NODE_ENV=production` | Not implemented. Confirmed 2026-09-29: no `NODE_ENV` or `DATABASE_URL` check anywhere in `apps/backend/prisma/seed.ts`, and `main()` starts with `deleteMany` sweeps (lines 232-250) | ❌ | Must do before deployment. The seeded accounts (`<role>@jmcfi.edu.ph`, shared default password) must never exist on an internet-facing instance |
| 1.4 | Schema sync (`db:push` or `migrate deploy`) on production | Schema updated without data loss | Not done | ⏳ | Should be run by the Neon project owner |
| 1.5 | `just test` or `just test-integration` | Tests run on a database that holds no uploaded or seeded work | `apps/backend/test/helpers/run-tests.ts` runs `wipeTestDatabase()` (TRUNCATE of all 39 tables) before and after every run, so each run starts blank | ✅ | Local and prod are **separate Neon branches with the same schema**, so production is never wiped. Side effect on the dev branch: seed and uploaded test data are erased every run — run `just db-seed` before browser tests |

---

## 2. Python ETL (section extraction)

| # | Input | Expected | Actual | Status | Notes |
| --- | ------- | ---------- | -------- | -------- | ------- |
| 2.1 | Unit tests: clean, whitespace/lowercase, trailing colon, shifted row, reordered sheet, missing sheet, missing label, unparseable, extras, full pipeline | `section` and `setup` returned as designed | 10 section tests passed; full suite 21 passed, 0 failed | ✅ | Generated workbooks only |
| 2.2 | Real class record (`SETUP` tab, `Section` in A4, value in B4) | `section.code = "1A"`, `program = "BSIT"`, `section_extraction = "ok"` | Ran against `JMCFI_Class_Record_Template_AUN-OBE.xlsx`. Section, program, and term extracted correctly. See 2.4 audit output for full JSON | ✅ | Template/format and grading system are the client's actual AUN-OBE standard, confirmed by the client as what they currently use. Student names/records inside are fabricated for testing (see 2.3) |
| 2.3 | Real faculty class record with real student data | Same as 2.2, on data from an actual class | **Partially validated.** The workbook format, sheet layout, and grading computation are the client-provided, client-validated AUN-OBE template — not a guess or our own construction. However, the student roster and scores inside are made up, not pulled from an actual class the client ran | ⚠️ | Format = real and client-approved. Data = synthetic. No workbook has been tested where BOTH the format and the student data came from an actual completed class. First true end-to-end real-world validation will happen when a faculty member uploads their own completed AUN-OBE sheet post-deployment |
| 2.4 | Upload a workbook that still has the old layout (`Database`/`Exam`/`OUTPUT`/`COVERPAGE` sheets) or a non-LECTURE course type, through the browser | A clear structured error shown in the UI | Both triggers actually run (not inferred): (a) `E-classrecord(LECTURE ONLY).xlsx` (old, discontinued layout, unrelated to the current AUN-OBE template) → raised `MissingWorksheet`, exact message: "Missing required worksheet: 'Direct CLO'." (b) synthetic PRACTICUM-type workbook → raised `UnsupportedCourseType`, exact message: "Course type 'PRACTICUM' is not yet supported. Only LECTURE course records can be processed at this time." Both caught by the worker (`except OBELISKError`), converted via `.to_dict()`, and delivered as structured JSON on `GET /jobs/{job_id}`, not a stack trace | ✅ | Verified 2026-09-30 with actual exception output, not code-reading. Old-layout file confirmed discontinued, separate from the current AUN-OBE format (see 2.2/2.3). Not yet checked that the frontend renders this JSON as a readable message rather than a raw error — that's still a browser-level gap |
---
**Workbook used so far:** `JMCFI_Class_Record_Template_AUN-OBE.xlsx` — this IS the client's real, currently-used AUN-OBE template and grading format (confirmed by the client), but the student data inside is fabricated for testing purposes, not from an actual class.

## 3. Backend section verification

| # | Input | Expected | Actual | Status | Notes |
| --- | ------- | ---------- | -------- | -------- | ------- |
| 3.1 | Unit tests (`section-verifier`, 11 cases) plus all unit suites | All pass | 149 pass, 0 fail, 628 expect() calls across 17 files. `typecheck`: 0 errors. Re-run 2026-09-29 after the monorepo move — unchanged | ✅ | Logic only, no database |
| 3.2 | Integration suite through `just test-integration` (python-server and Redis running) | All files run and pass | **Re-run 2026-09-29: 39 pass, 0 fail, 310 expect() calls, 9 of 9 files, 161.65 s — exit 0.** Two causes of the old stoppage found and fixed: (1) F11/AI tests sit at/over Bun's 5000 ms default — run with `--timeout=30000` (without it the AI test flakes at exactly 5000.02 ms, observed same day); (2) `periodic.test.ts` leaked its `2098-2099/2nd` term (its reset runs at test *start*, no `afterAll`) which collided with `ingest.test.ts` updateScores on the `(school_year, semester)` unique constraint — added `afterAll` cleanup | ⚠️ | Fully passing, but the `--timeout=30000` flag is not yet wired into `run-tests.ts` (see 7). Bare `bun test` still does not load `.env.local`, so use the `just` recipes |
| 3.3 | Upload, then poll with a different `classSectionId` | Rejected (`SectionBindingMismatchError`, 400) | Test passed in the 2026-09-29 full run (888 ms). A real gap was found and fixed the same day: `jobCompletionCache` was read *before* the binding check, so a poll on a **completed** job with the wrong section returned the cached 200 — the binding check now runs first (`ingest/service.ts:1015-1037`) | ✅ | Integration test + fix verified in the same run |
| 3.4 | Unknown `classSectionId` on **upload** | 404, no auto-created section | `POST /upload` throws `ClassSectionNotFoundError` → 404 (`ingest/service.ts:916`), and no `classSection.create` exists anywhere in `src/`. Service-level test passed in the 2026-09-29 run. **Spec amended 2026-09-29:** the *poll* route deliberately never 404s — it returns 400 on binding mismatch, `200 {status:"failed"}` on an unknown job | ✅ | Expected narrowed from "any endpoint" to "upload" by agreement; poll behavior documented, not a bug |

---

## 4. Upload flow (browser)

| # | Input | Expected | Actual | Status | Notes |
| --- | ------- | ---------- | -------- | -------- | ------- |
| 4.1 | Open upload form | Dropdown lists `IT 101 — 1A`; button disabled until section and file are chosen | Dropdown was initially empty. Server Action returned nothing. Fixed with a client-side fallback and visible empty/error states | ⚠️ | Root cause of the empty server-action result never fully explained. Check that other server actions do not fail the same way |
| 4.2 | Select `1A`, upload the template workbook | Completes, rows saved under `1A` | "Total uploads: 1, Completed: 1" | ✅ | Warnings and counts were not recorded. Add them here |
| 4.3 | Course-code comparison | No warning when `IT101` vs `IT 101` | Fixed in code: `section-verifier.ts:33` `normalizeCompact` strips all whitespace and uppercases; unit test `section-verifier.test.ts:75-103` passes `" it 101 "` vs `"IT101"` → match, no mismatch | ✅ | Code + unit test only, not browser. The test asserts `mismatches` empty but not `warnings` empty |
| 4.4 | Selector during upload and polling | Locked while a job runs | `class-record-upload.tsx:98` — `isWorking` (uploading/processing) disables the section select, the file input and the section-change handler; polling keeps `processing` for the whole job | ✅ | Code inspection only, not browser |
| 4.5 | Change section after a finished upload | Old result cleared | | ⏳ | |

---

## 5. Section mismatch tests (use an edited COPY of the template, `SETUP` tab, cell B4)

Quick to run: 5.1, 5.6, 5.7 and 5.8 need only an edited copy of the template. Do these first.

| # | Input | Expected | Actual | Status | Notes |
| --- | ------- | ---------- | -------- | -------- | ------- |
| 5.1 | Select `1A`, upload copy edited to `BSIT - 2B` | Red alert naming both values. Nothing saved: uploads count unchanged, `1A` summary and CAR unchanged | Alert implemented: `class-record-upload.tsx:372-407` renders the backend message that names both values (`section-verifier.ts:113` `Workbook section "X" does not match selected "Y"`); the mismatch throws before persistence (`ingest/service.ts:200`) | ⏳ | Code inspection only. Still needs the browser run + a database check for stray rows |
| 5.2 | Select `1A`, upload copy edited to `BSCS - 1A` | Rejected on program mismatch | Same code path as 5.1 (`section-verifier.ts:129-133`) | ⏳ | Code inspection only |
| 5.3 | Select `1A`, upload copy with the `SETUP` tab renamed or the `Section` label removed | Succeeds with an "unverified" notice | | ⏳ | Deliberate behavior, not a failure |
| 5.4 | "Reset file" after a mismatch | Can retry without reloading the page | Reset implemented: `handleResetFile` (`class-record-upload.tsx:123-128`) clears items, verification and mismatch state; button on the mismatch alert (`:396-404`) | ✅ | Code inspection only, not browser |
| 5.5 | Re-upload the same file to `1A` | Defined behavior (block or replace) | Neither. A second upload appends a whole new run: `computationRun.create` (`ingest/service.ts:222`) plus `cloAttainment.create` per row (`:299`), with no delete or replace. CQI (`cqi/service.ts:278`) and rollup (`rollup/service.ts:639`) read without a run id and would double-count | ❌ | Code audit 2026-09-29. Decide block-or-replace before real use. Polling the same job id is idempotent (`service.ts:25` cache); only re-POSTing duplicates |
| 5.6 | Copy edited to `BSIT - 1B`, select `1A` (only the letter differs) | REJECTED. `1B` does not match `1A` | Comparison is exact after normalization (`section-verifier.ts:104-117`): `"1B"` ≠ `"1A"` → mismatch | ⏳ | Code inspection only |
| 5.7 | Copy edited to `BSIT - 2A`, select `1A` (only the year differs) | REJECTED | Same code path: `"2A"` ≠ `"1A"` → mismatch | ⏳ | Code inspection only |
| 5.8 | Copy edited to `bsit-1a` or `BSIT   -   1A` (formatting only), select `1A` | ACCEPTED. Normalization treats it as the same section | Comparison side normalizes case and whitespace (`normalizeCompact`, `section-verifier.ts:33`), applied to section code, program and course code | ⏳ | Still needs the browser run: acceptance also depends on the Python ETL splitting `BSIT   -   1A` into program + code correctly, which is untested |
| 5.9 | Workbook says a section that exists in the system but is not the selected one (workbook `1B`, selected `1A`, real `1B` seeded) | REJECTED. The selection is the source of truth | | ⏳ | Needs a second dev-only section (e.g. `IT 101 — 1B`). Ask Kim to add it to the seed |
| 5.10 | Workbook says `1A`, but a different section is selected in the dropdown | REJECTED | | ⏳ | Needs the same second section. This is the real-world mistake (wrong pick from a long list) |
| 5.11 | Section matches, but `setup.course_code` differs (copy edited to another course) | ACCEPTED with a warning | | ⏳ | Deliberate: course and term are warnings only for now. Decide whether they should block |
| 5.12 | Section matches, but the term differs (copy edited to `2nd Sem, AY 2025-2026`) | ACCEPTED with a warning | | ⏳ | Same policy as 5.11 |

---

## 6. Reports (browser)

| # | Input | Expected | Actual | Status | Notes |
| --- | ------- | ---------- | -------- | -------- | ------- |
| 6.1 | CAR page, select `1A`, Generate | Report renders without crashing | All 7 tabs rendered. Header, P3 (cohort avg 81.2%, 5 CLOs MET) and P4 (12 at-risk students) show real data | ⚠️ | Fixed two bugs: flat vs nested payload shape (`part1.course`), and a hooks-count error from an early return |
| 6.2 | CAR: Generate a second time, and switch sections | No hooks error | Code audit: no conditional hooks remain in `CarForm` or the Part components, so the original cause is gone; switching sections resets the payload (`car-form.tsx:805-811`). No explicit remount on re-generate; `resetCarAtom` (`lib/store/atoms/car.ts:167`) is dead code | ⏳ | Not checked in the browser |
| 6.3 | CAR: Save button | Persists edits | **Broken.** `saveCar` POSTs to `/car/${id}` (`server/actions/car.ts:49`) but the backend route is `PUT /car/:id` only (`car/controller.ts:96`) → 404 → UI shows "Save failed". Same bug on the curriculum map: `plan.ts:70` POSTs to `PUT /plan/curriculum-map/:id`. Backend save logic itself is complete (`car/service.ts:206-255`) | ❌ | Code audit 2026-09-29. Fix is one line: use `actionApi.put` (as `check.ts:83` and `plan.ts:362` already do) |
| 6.4 | CAR P1 CLO table (Bloom's, I-P-D, weight) | Filled when CLO-to-PLO mappings exist | All dashes | ⚠️ | Expected: no mappings yet. Test by adding one in the Curriculum Map Form, then regenerate |
| 6.5 | CAR P1 header (Year Level, Faculty), enrolled count | Filled | Year Level and Faculty show a dash. `noEnrolled` is 0 next to `noCompleted` 30. Causes found: `noEnrolled` = `enrollment.count` (`car/service.ts:150`) but **nothing in the repo ever creates `Enrollment` rows**; Year Level/Faculty are read only from saved formData / the (empty) `section.faculty` relation — the ETL-extracted values sit unused in `ComputationRun.etlSnapshotJson` | ❌ | Code audit 2026-09-29. Not a "not wired yet" item — the data source is empty by construction |
| 6.6 | CAR P2 (assessment types) | Per-assessment attainment, or a clear "no breakdown" message | Four tables of dashes. Root cause: `AssessmentCategory` was removed from the ETL for this template (`etl_const.py:205-215`), so `transformer.py:166` always falls through to `None` → NULL columns → dashes. The empty-state message exists (`car-form.tsx:174-187`) but is unreachable, because `buildPart2` always emits one row per CLO | ❌ | Code audit 2026-09-29. Permanent for this template unless per-assessment granularity returns; the empty-state needs to fire on all-null rows |
| 6.7 | CAR P5 (CQI) | Entries for NOT-MET CLOs | Empty. All cohort CLO averages are above 70% | ⚠️ | The written rule (manual §3.1.1) triggers CQI when a CLO's attainment is below 70%, so no entry matches it here. The 12 at-risk students are a separate track: per the client meeting, an action-taken form is submitted and approval clears the flag. **Confirmed 2026-09-29: that flow is not built (see 9.9)** |
| 6.8 | CLO Attainment Summary page, select `1A`, Generate | Average 81.16% (Proficient) and 5 CLO rows with badges | Verified through the service call only | ⏳ | Confirm on screen |
| 6.9 | At-risk rows with identical scores (Flores/Garcia, Hernandez/Ibarra/Javier) | Distinct real data | Identical rows | ⏳ | Probably filler rows in the template. Confirm with a real class record |
| 6.10 | CLO6 and CLO7 | Only real CLOs shown | Appear in P1 only. No attainment. Placeholder description | ⚠️ | Seed dev fixtures. Label or hide before real use |

---

## 9. Pipeline beyond CAR (browser, use the seeded role accounts)

Not started as a browser run. These cover the input-to-output chain and the approval hierarchy. The Actual column below records what the 2026-09-29 code audit found; write the live result over it as you run each one.

| # | Input | Expected | Actual | Status | Notes |
| --- | ------- | ---------- | -------- | -------- | ------- |
| 9.1 | As Dean, add CLO-to-PLO mappings for the course in Curriculum Map, then generate the PLO Attainment Summary for the term | PLO attainment equals the unweighted average of its mapped CLO section attainments (Formula 7A). Saved to `PloAttainment` | **Will not work as of 2026-09-29.** Mapping CRUD (`POST/PUT/DELETE /plan/clo-plo-map`), the generate endpoint and `PloAttainment` storage all exist, and Formula 7A is correctly unweighted in Python (`institutional_summary.py:50`) — but the payload fed to Python uses `snapshot.clo_plo_mapping` (`rollup/service.ts:376`), which the ETL always returns as `[]` (`extractor.py:191`, "CLO-PLO mapping is permanently retired"). DB `CloToPloMap` rows are never injected | ❌ | Code audit. Fix: build the payload from `prisma.cloToPloMap`. Integration test hides this by stubbing the fetcher (`rollup.test.ts:38`) |
| 9.2 | Leave one CLO unmapped, then generate the PLO summary | The unmapped CLO is left out of every PLO average. No crash | Python logic is correct: unmapped CLOs never enter `plo_data` and empty PLOs are skipped (`institutional_summary.py:34-46`). Moot until 9.1 is fixed — with the mapping always `[]`, every PLO is left out | ⏳ | Code inspection. Blocked on 9.1 |
| 9.3 | Lower a CLO below 70% (edit scores or CSV re-import), then open PLO Gap Analysis | One gap row per NOT-MET PLO and cohort combination | Endpoint and logic exist: `POST /cqi/plo-gap-analysis/generate` → `computeGapCandidates` (`cqi/compute.ts:117-139`) skips cohorts ≥70% and emits one row per NOT-MET PLO × cohort. This path reads DB `cloToPloMap` (unlike 9.1) | ⏳ | Code inspection only |
| 9.4 | As VPAA, open the dashboard AI drawer | A recommendation is generated from stored data, with no student names in the prompt | Gate and anonymization exist: `assertCanGenerateAiInsights` (`ai/controller.ts:76`), Python anonymizes before building the prompt (`institutional_summary.py:166-173`). Two caveats: raw names still travel in the HTTP body to python-server (`ai/compute.ts:34`), and the frontend posts an **empty body** while the route declares `termId` (`server/actions/ai.ts:70`) — may 400 | ⏳ | Needs a live run with python-server + Gemini key |
| 9.5 | As Faculty, Program Chair or Dean, try the same AI drawer | Blocked (403) | Confirmed in code: `generateAiInsights: ["vpaa","system_admin"]` (`apps/backend/lib/role-access.ts:38`), `RoleAccessForbiddenError` → 403 (`ai/controller.ts:31-33`); Generate button hidden for other roles (`ai-suggestions-drawer.tsx:199`) | ✅ | Code inspection, not browser |
| 9.6 | Faculty submits a form, then Program Chair, Dean, AQAU and VPAA approve in turn | Status changes at each step. Each role sees it under Pending Approvals only on its turn | Chain is server-derived from `APPROVAL_ROUTES` (`lib/forms/approval-routes.ts:57-207`) and steps are created on submit (`forms/service.ts:173-204`); the pending inbox only shows `currentApproverRole` matches (`service.ts:51-66`). Caveats: **faculty is a preparer, not an approver step**, and no registered form uses all 4 approver steps — the longest is `course_assessment_report` (program_chair → dean → aqau) | ⏳ | Code inspection only. Your stated requirement for the demo — the 4-step version only occurs for unknown form codes (default route) |
| 9.7 | A reviewer returns the form with a comment | Preparer sees "returned" and the comment, can edit and resubmit | Return endpoint stores the comment (`forms/service.ts:236-252`), the stepper renders it (`form-workflow.tsx:378-382`), and `returned → submitted` with edit rights is allowed (`state-machine.ts:19-27`). Caveat: the comment is wiped from the step rows on resubmit (`service.ts:188`) — it survives only in the audit log | ⏳ | Code inspection only |
| 9.8 | Program Chair tries to approve a form that is waiting on the Dean | Blocked | Two independent checks in code: an off-step caller fails `assertCanDecide` → 403 (`approval-routes.ts:270-274`); a wrong-turn caller with the right role fails the pending-step check → 409 (`forms/service.ts:231`) | ⏳ | Code inspection only. Note `system_admin` intentionally bypasses both |
| 9.9 | At-risk student flagged, then an action-taken form is submitted and approved | Flag stays until approval, then clears | **Not built.** `AtRiskFlag` is created/pruned only on score edits (`ingest/service.ts:319,441`); there is zero code for an action-taken form (no entry in `APPROVAL_ROUTES`, no page, no server action), and the approval path never touches `AtRiskFlag` | ❌ | Code audit 2026-09-29. Client requirement — list as a known limitation for the manuscript |
| 9.10 | Open each role's dashboard before and after an upload | Empty states first, then real numbers | Charts are wired to live atoms with empty states. **Stat cards never render:** `stats = []` for every role (`dashboard/role-dashboard.tsx:87`); roadmap has it unchecked. Not checked in the browser | ⚠️ | Code audit 2026-09-29 |

---

## 7. Known issues and open items

- [x] Integration suite stopped after `check.test.ts` — **fixed 2026-09-29**: full suite now runs 9/9 files, 39 pass. Causes were Bun's 5000 ms default timeout (F11/AI) and a leaked `2098-2099/2nd` term from `periodic.test.ts` colliding with `ingest.test.ts` (3.2).
- [ ] Suite must be run with `--timeout=30000` for the slow tests (F11, AI generation sit at ~5 s). The flag is not wired into `run-tests.ts` yet — `bun run test:integration -- --timeout=30000` for now, or add it to the spawn so a plain `just test-integration` is not flaky.
- [x] Tests wiping the database (1.5) — by design and safe: prod is a separate Neon branch (same schema), the wipe only hits the dev branch. Reseed with `just db-seed` after test runs.
- [ ] Seed wipes the dev branch on every run — no production guard exists (`apps/backend/prisma/seed.ts`, 1.3). Right now only the env/branch separation keeps prod safe; add a guard so that assumption is enforced.
- [ ] Seeded accounts use a shared default password. Keep them off any internet-facing instance.
- [ ] No way for a user to create a class section. Academic routes are GET-only; the dropdown works only because the seed makes `1A`.
- [ ] Faculty can upload to any section. Role allow-list only; `ClassSection.facultyId` exists in the schema but is never read.
- [ ] Re-upload appends a whole new run + rows, and CQI/rollup ignore the run id (5.5). Decide block-or-replace.
- [ ] CAR Save is broken: frontend POSTs, backend route is PUT → 404 (6.3). Same bug on curriculum-map save (`plan.ts:70`).
- [ ] PLO Attainment Summary ignores saved CLO-to-PLO mappings — the payload uses the ETL snapshot mapping, always `[]` (9.1).
- [ ] No action-taken form exists; approvals never clear at-risk flags (9.9). Client requirement.
- [ ] CAR: `noEnrolled` counts an `Enrollment` table nothing writes; P2 is NULL for this template by design; ETL year level/faculty/term never reach the report (6.5, 6.6).
- [ ] Dashboard stat cards are empty for all six roles (`role-dashboard.tsx:87`, 9.10).
- [ ] Root cause of the empty server-action result (4.1) not confirmed.
- [ ] CQI trigger rule: the manual triggers on a CLO below 70%, so an empty P5 is correct here. Ask the program chair how the at-risk share should be handled.
- [ ] Term and course differences are warnings only. Decide whether to make them blocking after real files pass.
- [ ] Ask Kim: `db:push` changed the shared schema, and the seed clears uploaded test data.
- [x] Course-code whitespace warning (4.3) — fixed: `normalizeCompact` in `section-verifier.ts:33`, covered by unit test.

---

## 8. Change log

| Date | Change | Verified how |
| ------ | -------- | -------------- |
| 2026-09-26 | Python ETL v2 for the AUN-OBE template: dynamic CLO and roster discovery, attainment recomputed from raw cells | `run_all.py` (all tests pass) |
| 2026-09-27 | Kim: `FormWorkflow` bar on the 7 CHECK screens, chart atoms wired to live endpoints with empty states, frontend dev mode off for real sessions, `db:seed` and `just db-*` recipes | Commit log only. Not yet checked in the browser (except the seed rows in Prisma Studio) |
| 2026-09-28 | Python ETL: extract section and `setup` from `SETUP` tab | pytest (21 pass) |
| 2026-09-28 | Backend: section verifier, section bound to upload, auto-create removed | Unit tests (149 pass), typecheck |
| 2026-09-28 | Frontend: section dropdown on upload form, verification messages | Browser (upload completed) |
| 2026-09-28 | Frontend: CAR payload shape and hooks fix | Browser (report rendered) |
| 2026-09-28 | Integration suite run through `just test-integration` | 12 pass, 1 fail, 6 files not reached (3.2) |
| 2026-09-29 | Read-only code audit of every ⏳/❌ row; statuses and Actual cells updated | Code reading only — no browser, no test run, no database touched. Findings are marked "code inspection" in each row |
| 2026-09-29 | 1.5 regraded ❌ → ✅: local/prod are separate Neon branches with the same schema, so the test wipe only hits the dev branch; §7 and §10 updated to match | Your confirmation of the branch setup + reading `wipe-db.ts` / `run-tests.ts` |
| 2026-09-29 | Integration suite runs to completion: `afterAll` cleanup added to `periodic.test.ts` (leaked term collided with ingest), binding check moved ahead of the job-completion cache in `getJobStatus` | `just test-integration -- --timeout=30000`: 39 pass, 0 fail, 9/9 files (3.2) |

---

## 10. Before the Oct 1 deployment

- [ ] Alpha test results in this document, copied into the manuscript (failures included, with cause)
- [ ] Deployment letter for the client
- [ ] Confirm with the instructor what "deployment" means on Oct 1 (a running instance for CITE and the client, or a public hosted URL). Chapter 1 lists hosting infrastructure as JMCFI's responsibility.
- [ ] Production guard on the seed, no default-password accounts on the deployed instance
- [x] Tests moved off the shared database — resolved: tests run on the dev branch, prod is a separate Neon branch (1.5)
- [ ] Section 9 run at least once end to end

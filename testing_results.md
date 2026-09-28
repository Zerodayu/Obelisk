# Obelisk: Testing Results

Tracks what the pipeline can and cannot do, from input to output.

**Last updated:** 2026-09-28
**Deployment target:** 2026-10-01 (Thursday)
**Due before deployment:** alpha test cases and results (this document, copied into the manuscript) and the deployment letter for the client. No beta or data gathering until REC clearance.
**Test database:** shared Neon (`.env.local`). Integration tests HAVE been run against it through `just test-integration`, but the run stops after `check.test.ts` (see 3.2). The test wrapper wipes the whole database before and after every run (see 1.5), so run `just db-seed` again afterward.
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
|---|-------|----------|--------|--------|-------|
| 1.1 | `bun run db:seed` | Cleanup, then demo users, CITE/BSIT, 13 PLOs, active term, 34 courses, section `1A`, 7 CLOs | All created. Section `1A` (id `clv92a9f...`) exists and points to the active term `2026-2027 1st Semester` | ✅ | Verified in Prisma Studio. Seed is destructive (see 6.1). No CLO-to-PLO mappings are seeded (see 6.4 and 9.1) |
| 1.2 | Seed run twice in a row | Idempotent, no errors | Ran several times without errors | ✅ | |
| 1.3 | Production guard on seed | Seed refuses to run when `NODE_ENV=production` | Not implemented | ⏳ | Must do before deployment. The seeded accounts (`<role>@jmcfi.edu.ph`, shared default password) must never exist on an internet-facing instance |
| 1.4 | Schema sync (`db:push` or `migrate deploy`) on production | Schema updated without data loss | Not done | ⏳ | Should be run by the Neon project owner |
| 1.5 | `just test` or `just test-integration` | Tests run on a database that holds no uploaded or seeded work | `test/helpers/run-tests.ts` calls `wipeTestDatabase()` before and after every run, against the shared Neon | ❌ | Any uploaded test data is erased by one test run. Use a separate Neon branch or project for tests. Reseed after every run |

---

## 2. Python ETL (section extraction)

| # | Input | Expected | Actual | Status | Notes |
|---|-------|----------|--------|--------|-------|
| 2.1 | Unit tests: clean, whitespace/lowercase, trailing colon, shifted row, reordered sheet, missing sheet, missing label, unparseable, extras, full pipeline | `section` and `setup` returned as designed | 10 section tests passed; full suite 21 passed, 0 failed | ✅ | Generated workbooks only |
| 2.2 | Real class record (`SETUP` tab, `Section` in A4, value in B4) | `section.code = "1A"`, `program = "BSIT"`, `section_extraction = "ok"` | Upload accepted by the section check | ⚠️ | Sample template only. Needs a real faculty file |
| 2.3 | Real faculty class record | Same as 2.2 | | ⏳ | Watch for merged cells, different label wording, course code format |
| 2.4 | Upload a workbook that still has the old layout (`Database`/`Exam`/`OUTPUT`/`COVERPAGE` sheets) or a non-LECTURE course type, through the browser | A clear structured error shown in the UI | Python tests pass (`MissingWorksheet`, `UnsupportedCourseType`). Not checked in the browser | ⏳ | Confirm the UI shows the message and not a generic 500 |

---

## 3. Backend section verification

| # | Input | Expected | Actual | Status | Notes |
|---|-------|----------|--------|--------|-------|
| 3.1 | Unit tests (`section-verifier`, 11 cases) plus all unit suites | All pass | 149 pass, 0 fail. `typecheck`: 0 errors | ✅ | Logic only, no database |
| 3.2 | Integration suite through `just test-integration` (python-server and Redis running) | All files run and pass | `ai.test.ts` 4 of 4 pass. `car.test.ts` 1 of 1 pass. `check.test.ts` 7 pass, 1 fail: F11 `exhibition_feedback` timed out at Bun's 5000 ms default. The run then stopped. Not reached: `cqi`, `forms`, `ingest`, `periodic`, `plan`, `rollup` (6 of 9 files) | ❌ | Reported to Kim. Working theory (not yet confirmed by a fix): the Neon connection left open by the timed-out test keeps Bun from moving on, made worse by the per-test wipe and reseed (F11 runs about 35 to 40 sequential queries). Kim reports his own runs did not show this. `ai.test.ts` needs python-server running (it times out without it). A bare `bun test` does not load `.env.local` (Zod env error), so use the `just` recipes |
| 3.3 | Upload, then poll with a different `classSectionId` | Rejected (`SectionBindingMismatchError`, 400) | | ⏳ | Covered only by `ingest.test.ts`, which the run never reached |
| 3.4 | Unknown `classSectionId` | 404, no auto-created section | | ⏳ | Auto-create fallback was removed. Same suite as 3.3 |

---

## 4. Upload flow (browser)

| # | Input | Expected | Actual | Status | Notes |
|---|-------|----------|--------|--------|-------|
| 4.1 | Open upload form | Dropdown lists `IT 101 — 1A`; button disabled until section and file are chosen | Dropdown was initially empty. Server Action returned nothing. Fixed with a client-side fallback and visible empty/error states | ⚠️ | Root cause of the empty server-action result never fully explained. Check that other server actions do not fail the same way |
| 4.2 | Select `1A`, upload the template workbook | Completes, rows saved under `1A` | "Total uploads: 1, Completed: 1" | ✅ | Warnings and counts were not recorded. Add them here |
| 4.3 | Course-code comparison | No warning when `IT101` vs `IT 101` | | ⏳ | Earlier response showed this warning. Whitespace fix may still be needed |
| 4.4 | Selector during upload and polling | Locked while a job runs | | ⏳ | |
| 4.5 | Change section after a finished upload | Old result cleared | | ⏳ | |

---

## 5. Section mismatch tests (use an edited COPY of the template, `SETUP` tab, cell B4)

Quick to run: 5.1, 5.6, 5.7 and 5.8 need only an edited copy of the template. Do these first.

| # | Input | Expected | Actual | Status | Notes |
|---|-------|----------|--------|--------|-------|
| 5.1 | Select `1A`, upload copy edited to `BSIT - 2B` | Red alert naming both values. Nothing saved: uploads count unchanged, `1A` summary and CAR unchanged | | ⏳ | Headline feature. Check the database for stray rows |
| 5.2 | Select `1A`, upload copy edited to `BSCS - 1A` | Rejected on program mismatch | | ⏳ | |
| 5.3 | Select `1A`, upload copy with the `SETUP` tab renamed or the `Section` label removed | Succeeds with an "unverified" notice | | ⏳ | Deliberate behavior, not a failure |
| 5.4 | "Reset file" after a mismatch | Can retry without reloading the page | | ⏳ | |
| 5.5 | Re-upload the same file to `1A` | Defined behavior (block or replace) | | ⏳ | Never defined. May double the attainment rows |
| 5.6 | Copy edited to `BSIT - 1B`, select `1A` (only the letter differs) | REJECTED. `1B` does not match `1A` | | ⏳ | Tests the letter alone |
| 5.7 | Copy edited to `BSIT - 2A`, select `1A` (only the year differs) | REJECTED | | ⏳ | Tests the year alone |
| 5.8 | Copy edited to `bsit-1a` or `BSIT   -   1A` (formatting only), select `1A` | ACCEPTED. Normalization treats it as the same section | | ⏳ | Harmless formatting must not cause a rejection |
| 5.9 | Workbook says a section that exists in the system but is not the selected one (workbook `1B`, selected `1A`, real `1B` seeded) | REJECTED. The selection is the source of truth | | ⏳ | Needs a second dev-only section (e.g. `IT 101 — 1B`). Ask Kim to add it to the seed |
| 5.10 | Workbook says `1A`, but a different section is selected in the dropdown | REJECTED | | ⏳ | Needs the same second section. This is the real-world mistake (wrong pick from a long list) |
| 5.11 | Section matches, but `setup.course_code` differs (copy edited to another course) | ACCEPTED with a warning | | ⏳ | Deliberate: course and term are warnings only for now. Decide whether they should block |
| 5.12 | Section matches, but the term differs (copy edited to `2nd Sem, AY 2025-2026`) | ACCEPTED with a warning | | ⏳ | Same policy as 5.11 |

---

## 6. Reports (browser)

| # | Input | Expected | Actual | Status | Notes |
|---|-------|----------|--------|--------|-------|
| 6.1 | CAR page, select `1A`, Generate | Report renders without crashing | All 7 tabs rendered. Header, P3 (cohort avg 81.2%, 5 CLOs MET) and P4 (12 at-risk students) show real data | ⚠️ | Fixed two bugs: flat vs nested payload shape (`part1.course`), and a hooks-count error from an early return |
| 6.2 | CAR: Generate a second time, and switch sections | No hooks error | | ⏳ | |
| 6.3 | CAR: Save button | Persists edits | | ⏳ | |
| 6.4 | CAR P1 CLO table (Bloom's, I-P-D, weight) | Filled when CLO-to-PLO mappings exist | All dashes | ⚠️ | Expected: no mappings yet. Test by adding one in the Curriculum Map Form, then regenerate |
| 6.5 | CAR P1 header (Year Level, Faculty), enrolled count | Filled | Year Level and Faculty show a dash. `noEnrolled` is 0 next to `noCompleted` 30 | ⚠️ | ETL already extracts year and faculty, but the report does not use them yet |
| 6.6 | CAR P2 (assessment types) | Per-assessment attainment, or a clear "no breakdown" message | Four tables of dashes | ⚠️ | Upload has composite scores only. Add an empty-state message |
| 6.7 | CAR P5 (CQI) | Entries for NOT-MET CLOs | Empty. All cohort CLO averages are above 70% | ⚠️ | The written rule (manual §3.1.1) triggers CQI when a CLO's attainment is below 70%, so no entry matches it here. The 12 at-risk students are a separate track: per the client meeting, an action-taken form is submitted and approval clears the flag. Confirm that flow exists (see 9.8) |
| 6.8 | CLO Attainment Summary page, select `1A`, Generate | Average 81.16% (Proficient) and 5 CLO rows with badges | Verified through the service call only | ⏳ | Confirm on screen |
| 6.9 | At-risk rows with identical scores (Flores/Garcia, Hernandez/Ibarra/Javier) | Distinct real data | Identical rows | ⏳ | Probably filler rows in the template. Confirm with a real class record |
| 6.10 | CLO6 and CLO7 | Only real CLOs shown | Appear in P1 only. No attainment. Placeholder description | ⚠️ | Seed dev fixtures. Label or hide before real use |

---

## 9. Pipeline beyond CAR (browser, use the seeded role accounts)

Not started. These cover the input-to-output chain and the approval hierarchy. Write each result here as you run it.

| # | Input | Expected | Actual | Status | Notes |
|---|-------|----------|--------|--------|-------|
| 9.1 | As Dean, add CLO-to-PLO mappings for the course in Curriculum Map, then generate the PLO Attainment Summary for the term | PLO attainment equals the unweighted average of its mapped CLO section attainments (Formula 7A). Saved to `PloAttainment` | | ⏳ | Needs python-server running. Check one PLO by hand |
| 9.2 | Leave one CLO unmapped, then generate the PLO summary | The unmapped CLO is left out of every PLO average. No crash | | ⏳ | python-server no longer reads mappings, so confirm the backend handles this case |
| 9.3 | Lower a CLO below 70% (edit scores or CSV re-import), then open PLO Gap Analysis | One gap row per NOT-MET PLO and cohort combination | | ⏳ | |
| 9.4 | As VPAA, open the dashboard AI drawer | A recommendation is generated from stored data, with no student names in the prompt | | ⏳ | Needs python-server and the Gemini key |
| 9.5 | As Faculty, Program Chair or Dean, try the same AI drawer | Blocked (403) | | ⏳ | Role gate is `vpaa` and `system_admin` only |
| 9.6 | Faculty submits a form, then Program Chair, Dean, AQAU and VPAA approve in turn | Status changes at each step. Each role sees it under Pending Approvals only on its turn | | ⏳ | Your stated requirement for the demo |
| 9.7 | A reviewer returns the form with a comment | Preparer sees "returned" and the comment, can edit and resubmit | | ⏳ | |
| 9.8 | Program Chair tries to approve a form that is waiting on the Dean | Blocked | | ⏳ | Tests the role and turn checks |
| 9.9 | At-risk student flagged, then an action-taken form is submitted and approved | Flag stays until approval, then clears | | ⏳ | Client requirement. Not confirmed built. If missing, list it as a known limitation |
| 9.10 | Open each role's dashboard before and after an upload | Empty states first, then real numbers | | ⏳ | Kim's commit says the charts are wired. Not checked in the browser |

---

## 7. Known issues and open items

- [ ] Integration suite stops after `check.test.ts` (F11 timeout). Six files not run: `cqi`, `forms`, `ingest`, `periodic`, `plan`, `rollup`. Reported to Kim, not fixed.
- [ ] Tests wipe the shared database before and after every run (1.5). Use a separate Neon branch or project.
- [ ] Seed can wipe the shared database. Add a production guard and agree when it may run.
- [ ] Seeded accounts use a shared default password. Keep them off any internet-facing instance.
- [ ] No way for a user to create a class section. The dropdown works only because the seed makes `1A`.
- [ ] Faculty can upload to any section. No ownership check yet.
- [ ] Re-upload behavior undefined (5.5).
- [ ] Course-code whitespace warning (4.3).
- [ ] Root cause of the empty server-action result (4.1) not confirmed.
- [ ] CAR: `noEnrolled` shows 0, P2 empty state, and unused ETL fields (year level, faculty, term).
- [ ] CQI trigger rule: the manual triggers on a CLO below 70%, so an empty P5 is correct here. Ask the program chair how the at-risk share should be handled.
- [ ] Term and course differences are warnings only. Decide whether to make them blocking after real files pass.
- [ ] Ask Kim: `db:push` changed the shared schema, and the seed clears uploaded test data.

---

## 8. Change log

| Date | Change | Verified how |
|------|--------|--------------|
| 2026-09-26 | Python ETL v2 for the AUN-OBE template: dynamic CLO and roster discovery, attainment recomputed from raw cells | `run_all.py` (all tests pass) |
| 2026-09-27 | Kim: `FormWorkflow` bar on the 7 CHECK screens, chart atoms wired to live endpoints with empty states, frontend dev mode off for real sessions, `db:seed` and `just db-*` recipes | Commit log only. Not yet checked in the browser (except the seed rows in Prisma Studio) |
| 2026-09-28 | Python ETL: extract section and `setup` from `SETUP` tab | pytest (21 pass) |
| 2026-09-28 | Backend: section verifier, section bound to upload, auto-create removed | Unit tests (149 pass), typecheck |
| 2026-09-28 | Frontend: section dropdown on upload form, verification messages | Browser (upload completed) |
| 2026-09-28 | Frontend: CAR payload shape and hooks fix | Browser (report rendered) |
| 2026-09-28 | Integration suite run through `just test-integration` | 12 pass, 1 fail, 6 files not reached (3.2) |

---

## 10. Before the Oct 1 deployment

- [ ] Alpha test results in this document, copied into the manuscript (failures included, with cause)
- [ ] Deployment letter for the client
- [ ] Confirm with the instructor what "deployment" means on Oct 1 (a running instance for CITE and the client, or a public hosted URL). Chapter 1 lists hosting infrastructure as JMCFI's responsibility.
- [ ] Production guard on the seed, no default-password accounts on the deployed instance
- [ ] Tests moved off the shared database
- [ ] Section 9 run at least once end to end

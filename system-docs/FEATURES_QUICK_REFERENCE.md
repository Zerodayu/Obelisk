# Features — Quick Reference

Purpose, usage, and expected result for each faculty-, Program-Chair-, Dean-, AQAU-, and VPAA-facing area.

## Faculty

### Faculty (Academic Context)

- **Purpose:** Pick the program → term → class section once so every form knows which class you are working on.
- **How to use:** Dashboard → Academic Context card → choose program, term, section (or **Add class section**).
- **Expected result:** The selection is saved locally and inherited by uploads, CAR, summaries, and every other form.

### Class-record Upload (`/forms/clo-raw-data`)

- **Purpose:** The foundation — turn your AUN-OBE Excel/CSV/TSV class record into per-student CLO scores.
- **How to use:** Confirm the section in Academic Context, drop the file, review the preview, confirm (or enter scores manually).
- **Expected result:** Scores are stored, CLO attainment is computed server-side, and any student below 70% on any CLO gets an At-Risk flag.

### Mid-Cycle Summary (`/forms/check/mid-cycle-attainment`)

- **Purpose:** A mid-term, per-program-and-term snapshot of each CLO's attainment against the 70% floor, filed by faculty so the Program Chair sees below-target cohorts while there is still time to intervene.
- **How to use:** Pick program + term on the dashboard, open Record mid cycle attainment, fill the course header and one cohort row per CLO (typing the % and picking the status from the dropdown), Save, then Submit from the submission card.
- **Expected result:** The header and cohort rows persist and the record moves to submitted / currentApproverRole program_chair on the chair→dean→aqau→vpaa chain, with no at-risk watchlist attached (that lives on CAR Part 4 / Action-Taken).

### Course Assessment Report / CAR (`/forms/course-assessment-report`)

- **Purpose:** The term-level hub that consolidates attainment into 7 parts.
- **How to use:** Generate it from your upload (parts 2–4 auto-fill), complete the editable parts (1, 5, 6, 7), then submit.
- **Expected result:** The CAR routes Chair → Dean → AQAU → VPAA, and its data feeds the CLO/PLO roll-ups.

### Action-Taken Record (`/forms/cqi/action-taken`)

- **Purpose:** Document the intervention for each at-risk student.
- **How to use:** Open the form, add one record per flagged student (tutoring, re-assessment, advising), submit.
- **Expected result:** The At-Risk flag clears only when the record finishes its full approval chain (final VPAA approval).

### CLO Attainment Summary (`/forms/attainment/clo-attainment-summary`)

- **Purpose:** The full-term CLO picture per cohort.
- **How to use:** Pick the section, click **Generate** (it reads the ingest data), review.
- **Expected result:** Per-CLO scores with 4-tier level badges and MET/NOT MET against the hard ≥70% floor, with no manual status typing.

### My Submissions (`/submissions`)

- **Purpose:** Your personal inbox of everything you prepared.
- **How to use:** Sidebar → **My Submissions** (or **New submission**).
- **Expected result:** Each form listed with its live approval status/current approver, deep-linked to the form. Setup/Record-only forms are excluded since they have no approval chain; the VPAA uses **Submissions** (`/all-submissions`) instead.

## Program Chair

### Curriculum Map (`/forms/plan/curriculum-map`)

- **Purpose:** The PLO–course matrix with I-P-D stages that every downstream form must match.
- **How to use:** Map each PLO to its courses, pick each course's I-P-D stage, make sure every PLO has at least one D-stage course, then file it once.
- **Expected result:** The map is stored as reference data — CLO/PLO alignment on the CAR, PLO Summary, and Cohort Tracking is validated against it.

### Assessment Calendar (`/forms/plan/assessment-calendar`)

- **Purpose:** One dated plan of the year's assessment milestones.
- **How to use:** Open it — 17 template events are pre-seeded — adjust the dates and add program-specific items; don't delete the templates.
- **Expected result:** The program's calendar is saved and referenced by the term's assessment activities.

### Target-Setting Matrix (`/forms/plan/target-setting-matrix`)

- **Purpose:** Set the PLO and CLO targets per year level that every attainment status is measured against.
- **How to use:** Pick the program, enter the per-PLO/per-CLO targets for each cohort, save and file.
- **Expected result:** Targets are stored; the server rejects anything below the hard ≥70% floor, and MET/NOT MET elsewhere is computed against these numbers.

### Pending Approvals (`/approvals`)

- **Purpose:** Your inbox as the first approver on faculty submissions.
- **How to use:** Sidebar → **Pending Approvals** → open a form → **Approve** to advance it, or **Return** with a comment.
- **Expected result:** Approval moves the form to the next role in its chain (usually Dean → AQAU → VPAA); Return sends it back to the preparer. Your own submissions never appear here.

### PLO Attainment Summary (`/forms/attainment/plo-attainment-summary`)

- **Purpose:** Program-level PLO attainment rolled up from all sections for a term.
- **How to use:** Pick program + term, **Generate** (it also auto-runs when the context changes), review the per-PLO scores, Rule 3 status, and mapped CLOs, then submit.
- **Expected result:** Per-PLO scores and Rule 3 status are computed server-side; the summary routes Dean → AQAU → VPAA.

### Cohort Tracking Sheet (`/forms/attainment/cohort-tracking`)

- **Purpose:** Longitudinal CLO/PLO attainment across Y1–Y4 cohorts — the Permanent-retention accreditation record.
- **How to use:** Pick the program, record the per-cohort attainment rows, add CQI follow-up annotations, and file it.
- **Expected result:** The trend grid is persisted as a permanent record; an approved Cohort Tracking Sheet for the program is what unlocks the APAR.

### Gap Analysis / CQI Action Plan (`/forms/cqi/plo-gap-analysis`, `/forms/cqi/cqi-action-plan`)

- **Purpose:** Turn every NOT-MET PLO into a documented, owned fix.
- **How to use:** Gap Analysis: record the NOT-MET PLO-cohort rows, assign one of the six root causes and a named owner. CQI Action Plan: add an intervention entry per gap with an owner and a measurable KPI.
- **Expected result:** The Gap Analysis routes Dean → AQAU → VPAA; CQI entries stay live and are tracked for implementation until a Closing-the-Loop report closes them.

### Closing-the-Loop / APAR (`/forms/cqi/closing-the-loop`, `/forms/cqi/annual-program-report`)

- **Purpose:** Prove the CQI interventions worked, then sign off the program's year.
- **How to use:** Closing-the-Loop: document the evidence for each CQI loop — the status is computed, never typed. APAR: fill the 12 KPIs, attachments checklist, and 5 narratives, attach the approved Cohort Tracking Sheet, then submit.
- **Expected result:** A loop reads CLOSED only when all 5 conditions are documented (otherwise OPEN - Re-assess / OPEN - Not Implemented), routed AQAU → VPAA. The APAR is blocked until an approved Cohort Tracking Sheet exists, then routes Dean → VPAA.

## Dean

### Pending Approvals (`/approvals`)

- **Purpose:** Your endorsement inbox — the sign-off before anything leaves the college.
- **How to use:** Sidebar → **Pending Approvals** → open a form → **Approve** to advance it, or **Return** with a comment.
- **Expected result:** Approval advances the form to the next role (usually AQAU, then VPAA); Return sends it back to the preparer. Your own submissions never appear here.

### Assessment Budget (`/forms/plan/assessment-budget`)

- **Purpose:** Track the assessment budget across PDCA phases, with 12 fixed line items pre-seeded.
- **How to use:** Open it, set the amounts per line item, add custom items for program-specific needs, then submit.
- **Expected result:** The budget routes straight to the VPAA (AQAU copied) and later serves as the baseline for Resource Monitoring.

### PLO Management (`/plo-management`)

- **Purpose:** The dean-only place to create, edit, and retire Program Learning Outcomes.
- **How to use:** Pick the program, add or edit PLOs (codes continue sequentially: PLO1, PLO2, …), keep targets at or above 70%, and use the CLO–PLO Connections tab to see mappings.
- **Expected result:** PLOs are stored per program; retiring a PLO is blocked while it is mapped or carries attainment/gap/CQI history, and faculty map the resulting PLOs to CLOs in the Curriculum Map.

### Resource Monitoring (`/forms/periodic/resource-monitoring`)

- **Purpose:** Prove the resources the assessment plan required were acquired and that the cycle's CQI actions were actually implemented.
- **How to use:** Record the acquisition rows by PDCA phase plus the CQI implementation rows, then submit.
- **Expected result:** The record routes to the VPAA and becomes the spend/implementation evidence tracked against the approved budget.

### Systemic Gap Report (`/forms/periodic/systemic-gap-report`)

- **Purpose:** Escalate a PLO–cohort that has failed the ≥70% benchmark for three consecutive cycles.
- **How to use:** Select the affected PLO–cohort, document the accredited root cause and the recommended structural response, then submit.
- **Expected result:** Submission is gated server-side on a Cohort Tracking Sheet showing 3+ consecutive NOT-MET cycles; the report routes to the VPAA (AQAU copied).

### CAPA Plan (`/forms/periodic/capa-plan`)

- **Purpose:** The structural fix for a systemic gap — up to 8 owner-assigned actions with progress reviews.
- **How to use:** Reference the approved Systemic Gap Report, add each corrective/preventive action with its owner and review points, then submit.
- **Expected result:** Submission is blocked until the referenced Systemic Gap Report is approved; the plan routes AQAU → VPAA and stays under AQAU monitoring until closed.

## AQAU

### Pending Approvals (`/approvals`)

- **Purpose:** Your accreditation-readiness checkpoint — you sit after the Dean on nearly every chain before data reaches the VPAA.
- **How to use:** Sidebar → **Pending Approvals** → open a form → verify the evidence → **Approve** or **Return** with a comment.
- **Expected result:** Approval moves the form up to the VPAA (the final rung); Return sends it back down the chain. You verify submissions, you never create program data.

### Closing-the-Loop and CAPA Validation (`/forms/cqi/closing-the-loop`, `/forms/periodic/capa-plan`)

- **Purpose:** Confirm that a CQI loop or a CAPA plan is backed by real evidence before it counts as closed.
- **How to use:** Open the filed Closing-the-Loop report or CAPA plan, check the evidence behind each of the five closure conditions and the action progress reviews, then approve or return.
- **Expected result:** A loop shows CLOSED only when all five conditions are documented — otherwise OPEN - Re-assess or OPEN - Not Implemented; approved CAPA plans stay under AQAU monitoring until their actions are complete.

### Cohort Tracking Audit (`/forms/attainment/cohort-tracking`)

- **Purpose:** Audit the longitudinal CLO/PLO record that accreditors pull first.
- **How to use:** Review each program's filed Cohort Tracking Sheet against the underlying section data, then approve it from **Pending Approvals**.
- **Expected result:** The sheet is sealed as Permanent-retention evidence, and an approved sheet for the program is what unblocks the APAR.

### Archives / Cluster Confirmation (`/archives`)

- **Purpose:** Confirm a graduation cluster is complete so its evidence can be sealed for accreditation.
- **How to use:** Review the cluster's composition and status, then click **Confirm cluster** on the cluster page (AQAU/System Admin, `open` clusters only) to capture the current PEO attainment; the `/archives` browser is read-only and open to AQAU, VPAA, and System Admin.
- **Expected result:** The cluster is stamped with a confirmation timestamp and released for archival; archived data is permanent and read-only.

### Institutional Management Review (`/forms/periodic/institutional-review`)

- **Purpose:** The annual institution-level review record — per-program APAR/CTL/systemic-gap compliance, institutional CQI completion, and decisions forwarded to the President.
- **How to use:** Compile it from the program-level submissions (never re-typed by hand), record the review findings and decisions, then submit.
- **Expected result:** The record routes to the VPAA, who presides over the review and gives final approval.

## VPAA

### Final Approvals (`/approvals`)

- **Purpose:** The last rung on every approval chain — nothing is final until you sign it.
- **How to use:** Sidebar → **Pending Approvals** → open a submission → check the evidence and every prior rung → **Approve** to finalize it, or **Return** with a comment.
- **Expected result:** Approval finalizes the submission and makes it eligible for archival; Return sends it back to the preparer. Your own submissions never appear here (the VPAA does not prepare forms). Approving an Action-Taken Record is what clears that student's At-Risk flag.

### Archive Approved Submissions (`/all-submissions`, `/archives`)

- **Purpose:** Turn approved submissions into the permanent, immutable record accreditors audit.
- **How to use:** Sidebar → **Submissions** (`/all-submissions`) — the list defaults to approved forms institution-wide — then click **Archive** on a row and confirm; browse sealed graduation clusters under **Archives** (`/archives`).
- **Expected result:** Archiving is permanent — the submission becomes read-only and can never be edited or resubmitted. `/archives` stays read-only for VPAA, AQAU, and System Admin; only the VPAA and System Admin can archive.

### Budget Authorization (`/forms/plan/assessment-budget`)

- **Purpose:** Authorize the college's assessment spend for the cycle — the Dean's budget arrives here as the only approver.
- **How to use:** Open the form from **Pending Approvals** or `/forms/plan/assessment-budget`, review the 12 fixed PDCA line items plus any program-specific additions, then **Approve** or **Return** with a comment.
- **Expected result:** Approval authorizes the budget, which then serves as the baseline the Dean's Resource Monitoring (`/forms/periodic/resource-monitoring`) is measured against.

### Systemic Gap / CAPA Decisions (`/forms/periodic/systemic-gap-report`, `/forms/periodic/capa-plan`)

- **Purpose:** Decide the structural response when a PLO–cohort fails the ≥70% benchmark for three consecutive cycles.
- **How to use:** Sidebar → **Rule on systemic gaps & CAPA** (opens Pending Approvals filtered to those two forms), approve or return the Dean's Systemic Gap Report first (it routes straight to you, AQAU copied), then review the resulting CAPA Plan — up to 8 owner-assigned corrective/preventive actions — after AQAU has validated it.
- **Expected result:** An approved Systemic Gap Report unlocks the CAPA Plan; the approved plan stays under AQAU monitoring until its actions are complete and the benchmark is sustained.

### Institutional Management Review (`/forms/periodic/institutional-review`)

- **Purpose:** The annual institutional review you preside over — program APAR/CTL/systemic-gap compliance, institutional CQI completion, and the decisions forwarded to the President.
- **How to use:** Sidebar → **Approve the institutional review** (opens Pending Approvals filtered to this form), review the AQAU-compiled findings and proposed decisions, then **Approve** to close the review.
- **Expected result:** The approved record is the institution-level evidence for the year, and its decisions are forwarded to the President.

### AI Strategic Insights (dashboard AI drawer)

- **Purpose:** Generate an institution-wide CQI recommendation across every college — a VPAA/System Admin exclusive.
- **How to use:** Dashboard → **Ai Insights/Suggestions** → **Generate insight** (a saved recommendation loads if one exists; refresh to regenerate) and read the narrative with its key gaps and pedagogical context.
- **Expected result:** The recommendation is produced by Gemini from PII-scrubbed consolidated data, persisted as `pending_review`, and shown with a live at-risk block for VPAA/AQAU roles. AI output is advisory only — validate it against institutional policy and the 70% floor.

# JMCFI WIN-OBE Forms — Field-by-Field Digitization Reference
**Forms F01–F28 (fully specified in the manual). F29, F30B/C/D, F31–F37, F41 are referenced but not yet developed — no field structure exists for them in this document; treat as future/placeholder forms if you build for them.**

Every form in the source PDF shares a standard header block and footer block. Build these as **reusable components** first:

### Standard Header Component (appears on every form)
```
Organization: JOSE MARIA COLLEGE FOUNDATION, INC.
Form Code + Title: "WIN-OBE-F## | <Form Title>"
Metadata row (table):
  - PDCA Phase: [PLAN | DO | CHECK | ACT | PERIODIC | ESCALATION]
  - Evidence Type: [Direct | Indirect | Direct + Indirect | Planning]
  - Deadline: <text>
  - Retention: [5 years | Permanent]
Responsible Party: <text describing the chain, e.g. "Faculty → Program Chair → AQAU">
Purpose statement (paragraph, includes the governing formula/rule where relevant)
```

### Standard Footer Component (appears on every form)
```
Signature block, typically 2 columns:
  Left: Prepared by / Submitted by / Compiled by (role) — Printed Name & Designation — Date
  Right: Received by / Approved by / Endorsed by (role) — Printed Name & Designation — Date
Page footer: "JMCFI Institutional OBE Assessment Plan | AY 2026–2027 | <page #>"
```

### Recurring Sub-Components (used across many forms — build once, reuse)
- **CLO/PLO status badge**: radio/checkbox set — `MET ✓ | NOT MET ✗` or `Exceptional | Proficient | Basic | Below Basic`
- **I-P-D stage selector**: checkbox set — `I ☐ P ☐ D ☐`
- **Year-level cohort selector**: checkbox set — `Y1 ☐ Y2 ☐ Y3 ☐ Y4 ☐`
- **Root Cause Category selector** (6 fixed options, used in F22/F23/F25/F26): `1-Curriculum Design | 2-Instruction & Pedagogy | 3-Assessment Design | 4-Student Factors | 5-Resources & Tools | 6-Industry & Field Alignment`
- **Bloom's Taxonomy level selector**: `Remember | Understand | Apply | Analyze | Evaluate | Create`
- **4-point rubric scale**: `Exceptional (9-10/85-100%) | Proficient (7-8/70-84%) | Basic (6/60%) | Below Basic (≤5/<60%)` — used as both a scoring input (numeric 1-10 or 1-4 depending on form) and a display badge
- **5-point Likert scale**: `1=Strongly Disagree | 2=Disagree | 3=Neutral | 4=Agree | 5=Strongly Agree`
- **Loop status badge** (F23/F25): `CLOSED ✓ | OPEN — Re-assess | OPEN — Not Implemented/Done`

---

## F01 — CLO-PLO Curriculum Map
**Phase:** PLAN | **Retention:** Permanent | **Prepared by:** Program Chair → Curriculum Committee → AQAU

**Section A: Program Identification**
- Program Title (text)
- Department Chair (text) | Academic Year (text, e.g. "2026-2027")
- Curriculum Committee Chair (text) | Review Date (date)
- Date Filed with AQAU (date) | Revision Number (text, e.g. "Rev. 3 — AY 2026-2027")

**Section B: PLO Directory** (repeating row, one per PLO)
- PLO Code (text)
- PLO Full Statement (long text)
- Primary Evidence Source (checkbox, multi-select): Exam ☐ Rubric ☐ Portfolio ☐ Capstone ☐ OJT ☐
- First CLO-PLO Matrix Designated D-Stage Course (text)
- Validation Status (radio): Confirmed ✓ | Pending Review | Needs Update

**Section C: CLO-PLO Mapping Matrix with I-P-D Levels**
- Grid: Rows = Course Title/Code grouped by Year Level (Year 1/2/3/4 section headers); Columns = PLO1, PLO2, ... PLO7+ (dynamic count)
- Cell value: free text combining stage + CLO code, e.g. "D / CLO3" (or blank)
- **Coverage Check row** (auto-computed, one cell per PLO column): Boolean — "Does this PLO have at least one D-level course?" Yes/No

**Footer:** Prepared by (Program Chair) | Reviewed by (Curriculum Committee) | Received by (AQAU) — each with date

**Digitization notes:** The PLO count and course count are both variable/dynamic — build as add/remove row tables, not fixed grids. The Coverage Check row should be a **computed field**: true if any cell in that PLO's column contains "D".

---

## F02 — Portfolio Roadmap and Rubric Standards
**Phase:** PLAN | **Retention:** Permanent | **Prepared by:** Program Chair (with Faculty) → Dean → AQAU | Portfolio programs only

**Part 1 — Program and Portfolio Overview**
- 1.1 Program Identification: Program Title, Specialization/Track, College/Department, Academic Year, Program Chair, OBE Coordinator, Date Prepared, Reviewed by AQAU/Curriculum Committee (date), Filed with AQAU (date)
- 1.2 Portfolio Overview: Portfolio Type/Format (text), Storage Platform (text), Portfolio Title Given to Students (text), Rationale (2–4 sentence long text)
- 1.3 PLOs Primarily Evidenced by Portfolio (repeating row per PLO): PLO Code, PLO Statement, Primary Evidence Year Level (checkbox Y1-Y4), I-P-D Stage at Year 4 (I/P/D checkbox), Other Assessment Tools that also evidence this PLO (text)

**Part 2 — Four-Year Portfolio Roadmap** (this block **repeats identically for Year 1, Year 2, Year 3, Year 4** — build as one reusable "Year Roadmap" component instantiated 4x)
- Per-year table, repeating row per Semester Entry (typically 6 rows: Sem1-Entry1/2/3, Sem2-Entry1/2/3):
  - Portfolio Output/Deliverable (text)
  - CLO(s) Evidenced (multi-select/text)
  - PLO(s) Evidenced (multi-select/text)
  - Bloom's Level & I-P-D Stage (dropdown)
  - Evidence/Assessment Event type (checkbox): Check-in ☐ | Formal Review ☐ | Exhibition ☐
- Portfolio Check-in Schedule sub-table (repeating row per check-in, ~4 rows/year): Semester, Week, Check-in Purpose and CLO/PLO Focus (text), Rubric Criteria to Assess (text), Feedback Method (checkbox: Written/Panel/Conference), Filed in Portfolio Record? (Y/N)
- **Year 3 only** adds: Formal Portfolio Review Panel Composition (Panel Member 1 & 2 names, Industry Practitioner name/org/role — required, Review Scheduled Date) + CQI Action text field for below-70% scorers
- **Year 4 only** adds: Capstone Exhibition Details (Exhibition Title, Venue/Format, Scheduled Date, Minimum Industry Guests Required = 3 fixed, Industry Guest names — 3 fields minimum) + text field listing PLOs to be demonstrated

**Part 3 — Portfolio Rubric Standards**
- 3.1 Rubric Criteria Summary Table (repeating row, up to 10 criteria): # , Criterion Name/Label (text), CLO Code, PLO Code, Bloom's Level (single-select from 6), I-P-D Stage (checkbox), Weight (%) & Year Level Applicable (number + checkbox Y1-Y4). **TOTAL row must validate to 100%.**
- 3.2 Detailed Rubric Criteria Blocks — **one repeating block per criterion** (matches count from 3.1):
  - Criterion label, CLO, PLO, Bloom's, I-P-D stage, Year Level(s), Weight %
  - 4-column performance descriptor grid: Exceptional (9-10) | Proficient (7-8) | Basic (6) | Below Basic (≤5) — each a free-text field for the observable descriptor
  - Calibrated Yes/No + Date calibrated with industry practitioner

**Part 4 — CLO Attainment Computation Guide** (static reference table — 4 steps + a benchmark table by Year Level with I-P-D stage, CLO Attainment Benchmark, Status Threshold, Action if Below Benchmark) — this is reference content, not user input, but could be rendered as read-only guidance in the digital form

**Part 5 — Rubric Calibration Record**
- Date of Session, Venue/Mode, Industry Practitioner Name/Org/Designation, Faculty Participants (list), No. of Sample Outputs Used
- Repeating row per criterion (up to 8): Criterion #/Name, Assessor 1 Score (1-4), Assessor 2 Score (1-4), Industry Practitioner Score (1-4), Max Diff. (computed), Agreement? (OK/FLAG, computed if diff ≤1), Descriptor Revised? (Y/N)
- Summary of Descriptor Revisions (long text)
- Signatures: Program Chair, Industry Practitioner, AQAU

**Part 6 — Compliance Checklist and Approval**
- 7 fixed checklist items (checkboxes, read-only labels — see source for exact wording)
- Signatures: Program Chair, Dean, AQAU

**Digitization notes:** This is the most complex form — recommend building the "Year Roadmap" and "Rubric Criterion Block" as reusable sub-components since they repeat 4x and up-to-10x respectively.

---

## F03 — Assessment Calendar with Cohort Tracking Milestones
**Phase:** PLAN | **Retention:** 5 years | **Prepared by:** Program Chair → Dean → AQAU

- Section 1: Program, Program Chair, Academic Year, Date Approved by Dean, Date Filed with AQAU, Date Distributed
- Section 2: Semester 1 Calendar — repeating row: Period/Weeks, Assessment Activity/Milestone (text), Cohort(s) Affected (checkbox Y1-Y4/All), Responsible Party (text), Output/Form (multi-select of form codes F01-F28). Pre-populated template rows exist for: June-July PAC convening, OBE syllabi finalization, Weeks 1-2 orientation, Weeks 3-5 formative, Weeks 7-9 midterm, Weeks 15-18 finals, within-10-days CAR submission, within-4-weeks consolidation, before-next-semester CQI plan.
- Section 3: Annual and Semester 2 Events — same row structure, pre-populated rows for Sem 2 repeat cycle, Year 3 Portfolio Review, Year 4 Exhibition, June 30 APAR, End-of-AY CTL, July 15 Institutional Review, biennial Alumni/Employer surveys, 30-day escalation.
- Section 4: Program-Specific Additional Events — free-form repeating row (event description, blank)
- Footer: Prepared by (Program Chair), Approved by (Dean)

**Digitization notes:** Sections 2-3 function well as a pre-seeded, editable calendar/Gantt table where the "template" rows are defaults the Program Chair can adjust dates for but not delete (the activity/deadline logic is institution-mandated).

---

## F04 — Target-Setting Matrix (CLO/PLO Benchmarks per Year-Level Cohort)
**Phase:** PLAN | **Retention:** 5 years | **Prepared by:** Program Chair/Dean → AQAU

- Section 1: Program, Program Chair, Academic Year, Prior-Year Program PLO Avg (%) [from prior F24], Prior-Year Y4 PLO Attainment (%), PAC Review Date
- Section 2: PLO Performance Targets by Year-Level Cohort — repeating row per PLO: PLO Code, PLO Statement (abbreviated), Y1/Y2/Y3/Y4 Target (%) [each with a hard floor validation ≥70%], Rationale if Above Floor (text). Bottom row: Program PLO Avg (computed).
- Section 3: Course-Level CLO Targets — Priority Courses — repeating row: Course Code & Title, CLO Code, Y1-Y4 Target (%), Notes
- Rationale text box (long text) for above-floor targets
- Footer: Prepared by (Program Chair), Approved by (Dean)

**Digitization notes:** Enforce a **hard minimum validation of 70%** on every target field — this is a repeated institutional rule across the whole system, worth a shared validator component.

---

## F05 — Stakeholder Consultation Records
**Phase:** PLAN | **Retention:** 5 years | **Prepared by:** Program Office/Dean → Program Chair

- Section 1: Program, Program Chair, Academic Year, Date of Consultation, Mode (checkbox: In-person/Online/Hybrid), Venue/Platform, Facilitator
- Section 2: Participants — table by Stakeholder Group (fixed rows: Faculty-Internal, Students, Alumni, Industry Partners/Employers, PAC Members) × columns (Name(s), Organization/Designation, Notes)
- Section 3: PLO Relevance Validation — repeating row per PLO: PLO Code, PLO Statement (abbreviated), Stakeholder Feedback (long text), Decision/Action (checkbox: Retain/Revise/Escalate to Curriculum Committee)
- Summary of Key Findings (long text)
- Footer: Prepared by (Program Office), Received by (Program Chair)

---

## F06 — Approved Assessment Budget
**Phase:** PLAN | **Retention:** 5 years | **Prepared by:** Dean → VPAA (copy AQAU)

- Section 1: Program, Dean, Academic Year, Total Budget Requested (PHP), Date Dean Approved, Date VPAA Approved, VPAA Name
- Section 2: Budget Breakdown — fixed repeating rows grouped by phase (PLAN/DO/CHECK/ACT), 12 pre-defined activity line items (e.g. Industry Practitioner Calibration, Stakeholder Consultation, Student Exit Survey admin, CLO Perception Survey, Portfolio Exhibition, Peer Observation support, Capstone Panel honoraria, Survey tabulation, Alumni Tracer, Employer Survey, CQI planning support) — each row: Estimated Cost (PHP), Approved Cost (PHP), Source (dropdown: AQAU/Dean/VPAA), Notes/Justification
- TOTAL row (computed sum)
- Footer: Submitted by (Dean), Approved by (VPAA)

**Digitization notes:** The 12 line items are fixed/standard — build as a pre-populated table (not fully freeform) so totals roll up correctly; allow adding extra rows for program-specific costs.

---

## F07 — Per-Student CLO Raw Data Sheet (Course Level)
**Phase:** DO | **Retention:** 5 years | **Prepared by:** Faculty → Program Chair

- Section 1: Course Title, Course Code, Academic Year, Semester (1st/2nd), Assessment Period (Wks 3-5/7-9/other), Section, Faculty, Date of Assessment
- Section 2: Assessment-to-CLO Mapping — repeating row: Assessment Title, Assessment Type (checkbox: Quiz/Exam/Rubric Output/Perf.Task/Portfolio CI), Max Score (number), CLO(s) Measured, Bloom's Level & I-P-D Stage
- Section 3: Student CLO Attainment Records — **the core per-student data table**, one row per enrolled student: Student Name/ID, Year Level/Cohort (Y1-Y4 checkbox), CLO1/CLO2/CLO3/CLO4 Score (%) [dynamic columns — one per CLO defined in Section 2], At-Risk Status & Action (auto-flag if any CLO <70%, plus "Reported to PC" date field)
- Summary: No. of At-Risk Students (computed), Date Reported to Program Chair, Intervention Initiated (Y/N)
- Faculty Notes (long text)
- Footer: Prepared by (Faculty), Received by (Program Chair)

**Digitization notes:** This is the **primary data-entry form** of the whole system — every other CLO computation form pulls from here. Build the student roster as a proper data table (import/export CSV-friendly), and auto-compute the At-Risk flag (score <70% on any CLO) rather than relying on manual checkbox entry.

---

## F08 — Mid-Cycle CLO Attainment Summary (by Year-Level Cohort)
**Phase:** DO/CHECK | **Retention:** 5 years | **Prepared by:** Faculty → Program Chair

- Part 1: Course Title, Course Code, Academic Year, Semester, Section(s), No. Students Enrolled, Program, Year Level/Cohort, Mid-Cycle Assessment Week, Period Covered, Date Midterm Administered, Faculty Name, Date Submitted to Program Chair
- 1.1 Assessments Used for Mid-Cycle Data — repeating row (up to 8): #, Assessment Title/Description, Type (checkbox), Week Admin., Max Score, CLO(s) Measured, Bloom's Level (6-way select), I-P-D Stage
- Part 2: Mid-Cycle CLO Attainment by Year-Level Cohort — **repeats identically for Year 1, Year 2, Year 3, Year 4** (build as one reusable "Cohort Attainment Block"):
  - Header: No. of Students in Section, No. of At-Risk Students (below 70%), "Cohort Present in This Section?" Y/N
  - Repeating row per CLO: CLO Code, CLO Statement (abbreviated), PLO Mapped, Formative Assessment Avg (%), Quiz/Short Test Avg (%), Rubric Output Avg (%), Mid-Cycle CLO Attainment (%, computed), Status vs. ≥70% floor (MET/Early Warning/NOT MET)
  - Cohort Avg row (computed)
  - **At-Risk Student Watchlist** sub-table (repeating row): Student Name/ID, CLO(s) At-Risk, Assessment Type/Where Gap Found, Year Level/Cohort, Intervention (specific action + date)

---

## F09 — Resource Acquisition and Implementation Monitoring Report
**Phase:** DO | **Retention:** 5 years | **Prepared by:** Dean/Program Chair → VPAA

- Section 1: Program, Dean, Academic Year, Report Covers (1st Sem/2nd Sem/Full AY), Date Submitted
- Section 2: Resource Acquisition Status (from F06) — repeating row (typically ~12, mirroring F06 line items): #, Resource/Assessment Activity (as listed in F06), Budgeted Cost (PHP), Actual Cost (PHP), Acquisition Status (checkbox: Acquired/Pending/Not Acquired/N/A), Notes/Variance Explanation
- Section 3: CQI Action Implementation Monitoring (from F23) — repeating row: PLO/Cohort, CQI Action Planned (exact wording from F23), Named Owner, Implementation Status (checkbox: Fully/Partially/Not Yet Implemented), Evidence of Implementation (brief text citing date and form)
- Footer: Prepared by (Dean/Program Chair), Received by (VPAA)

---

## F10 — Peer Observation Record
**Phase:** DO | **Retention:** 5 years | **Prepared by:** Program Chair/Senior Faculty → Program Chair

- Section 1: Faculty Observed, Course Title/Code, Observer Name/Designation, Date of Observation, Time (Start/End), Section/Year Level, Semester/AY, No. Students Present
- Section 2: OBE and CLO/PLO Alignment Observation — 7 fixed criteria rows, each with: Evidence Observed (text, describe specifically with CLO references) + a Rating field (each criterion has its OWN rating scale):
  1. OBE Syllabus Alignment → Fully aligned / Partially aligned / Not evident
  2. Bloom's Taxonomy Level → Appropriate / Below cohort level / Above cohort level
  3. CLO-to-Assessment Mapping → Clearly mapped / Partially mapped / Not evident
  4. Rubric Use and Quality → Rubric used & CLO-aligned / Rubric used, not aligned / No rubric
  5. Formative Feedback Quality → Specific & CLO-referenced / General only / Not observed
  6. Active/Experiential Learning → Yes / Partially / No
  7. Student Engagement Level → High / Moderate / Low
- Strengths Observed (long text), Areas for Improvement (long text), CQI Implications (long text, ref. F23)
- Footer: Observed by (Program Chair/Senior Faculty), Acknowledged by (Faculty Observed)

---

## F11 — Portfolio Exhibition Industry Feedback Record
**Phase:** DO/CHECK | **Retention:** 5 years | **Prepared by:** Program Chair/Industry Liaison → Program Chair

- Section 1: Exhibition Title, Date, Venue/Mode, Program, No. of Student Exhibitors, No. of Industry Guests (minimum 3 required — validation)
- Section 2: Industry Guest Register — repeating row: Guest Name, Organization/Designation, Email/Contact, Signature
- Section 3: PLO Achievement Feedback — Industry Rating (10-point scale) — repeating row per PLO: PLO Code, PLO Competency description, Guest 1/2/3/4 score (0-10, dynamic columns per guest count), Mean Score (computed), Status vs. Proficient (≥7.0) — computed badge
- OVERALL MEAN row (computed)
- Qualitative Feedback (long text)
- Footer: Compiled by (Program Chair/Industry Liaison), Received by (Program Chair)

---

## F12 — CLO Achievement Perception Survey Tabulation
**Phase:** DO/CHECK | **Retention:** 5 years | **Prepared by:** Program Office → Program Chair

- Section 1: Course Title, Course Code, Academic Year, Semester, Date Administered (before grades), Total Respondents, Section(s), Response Rate (%, target ≥70%), Year Level/Cohort
- Section 2: CLO Perception Tabulation (5-pt Likert) — repeating row per CLO: CLO Code, CLO Statement (abbreviated), # Rating 1 (SD)/2(D)/3(N)/4(A)/5(SA) [5 count fields], Mean Rating (1-5, computed), % Rating 4+5 (computed, target ≥80%), Direct CLO Att. % (pulled from F13)
- Course Average row (computed)
- Section 3: Divergence Detection — repeating row per CLO: % Rating 4+5 (Survey), Direct CLO Att. (% from CAR), Difference in points (computed: |%4+5 − Direct%| ), Divergence Status (auto-flag: OK if <20pts, DIVERGENT if ≥20pts), Faculty Action Required (text, only if divergent)
- Program Office Notes (long text)
- Footer: Tabulated by (Program Office), Received by (Program Chair)

---

## F13 — Course Assessment Report (CAR) — CLO Attainment per Assessment Type
**Phase:** CHECK | **Retention:** 5 years | **Prepared by:** Faculty → Program Chair → AQAU
*(This is the largest and most central operational form — 7 Parts)*

**Part 1 — Course and Faculty Information**
- Course Title, Course Code, Academic Year, Semester (1st/2nd/Summer), Term (Prelim/Midterm/Finals), Section(s), Program, Year Level/Cohort, No. Enrolled, No. Completed, Date Submitted, Faculty Name, Designation
- 1.1 CLOs and PLO Mapping — repeating row per CLO: CLO Code, CLO Statement (from syllabus), PLO Mapped, Bloom's Level, I-P-D Stage, Assessment Type(s) Used (checkbox: Exam/Rubric/Perf.Task/Portfolio), Weight in Course Grade (%)

**Part 2 — CLO Attainment by Assessment Type** (4 sub-sections, complete only those applicable)
- 2.1 Exams and Quizzes: No. of Quizzes, Midterm Exam Y/N, Final Exam Y/N; repeating row per CLO: CLO Code, CLO Description, Max Score Allocated, Quiz Avg Attainment (%), Midterm CLO Att. (%), Final Exam CLO Att. (%)
- 2.2 Rubric-Scored Projects and Outputs (structure implied parallel to 2.1/2.3 — rubric score ÷10 ×100 per criterion)
- 2.3 Performance Tasks and Skills Demonstrations: repeating row per CLO: CLO Description, Task 1/2/3 Observed Rating Att. (%), Average Performance Task CLO Attainment (%, computed). Section Average row.
- 2.4 Portfolio/Capstone (portfolio programs only): Portfolio Assessment Event type (checkbox: Check-in/Formal Review/Capstone Panel), Event Date, Year-Level Milestone (Y1 Seeding/Y2 Dev/Y3 Review/Y4 Exhibition); repeating row per CLO: Rubric Criterion (from F02 Rubric Bank), PLO Mapped, Avg Rubric Score (1-4), CLO Attainment % (=avg÷10×100 — note: formula in source references both /4 and /10 scales depending on instrument, verify against F02/F18/F19 for the specific scale used), No. Below Benchmark, Attainment Level badge. Section Average row.

**Part 3 — Consolidated CLO Summary by Year-Level Cohort** — **repeats identically for Year 1, Year 2, Year 3, Year 4** (reusable block):
- Repeating row per CLO: CLO Code & descriptor, Exam/Quiz CLO Att. (%), Rubric/Project Att. (%), Perf. Task Att. (%), Portfolio/Capstone Att. (%), Weighted CLO Avg (%, computed), Attainment Level badge (Exceptional/Proficient/Basic/Below Basic), Status vs. Benchmark (MET/NOT MET)
- Cohort Avg row (computed)

**Part 4 — At-Risk Student Identification and Early Intervention**
- No. of At-Risk Students, Year Level, Date Reported to Program Chair
- Repeating row per at-risk student: Student Name/ID, CLO(s) At-Risk, Assessment Type Where Gap Found, CLO Att. (%), Year Level/Cohort, Specific Intervention Assigned (action + date)

**Part 5 — Course-Level CQI Action Plan Entries** — one row per CLO below benchmark: CLO Code, CLO Att. (%) Below Benchmark, Root Cause Category (6-way select), Specific Intervention (long text — must be specific per the "acceptability rule" example given), Named Owner, Timeline & Measurable KPI

**Part 6 — Indirect Evidence Notes**
- 6.1 Student Exit Survey Cross-Reference: repeating row: CLO/PLO, Student Avg Perceived Attainment (1-4 Likert), Direct CLO Attainment (%, from this CAR), Faculty Note on Aligned/Divergent
- 6.2 Faculty Instructional Self-Assessment: Teaching Strategies Used checklist (10 fixed options + Other: Direct Instruction, Case-Based Learning, Problem-Based Learning, Studio/Lab Practice, Project-Based Learning, Peer Critique/Group Work, Industry Guest/Mentorship, Flipped Classroom, Demonstration/Modeling, Simulation/Game-Based) + Faculty Reflection (long text)

**Part 7 — Certification, Submission, and Program Chair Review**
- Faculty certification statement (static text) + Submitted by/Received by signature block
- Program Head Disposition: checkbox (Accepted / Returned for Revision + Reason + Return-by date), CQI Entries Reviewed Y/N, Escalation Required Y/N, At-Risk List Received Y/N
- Program Chair Signature + Date Filed with AQAU

**Digitization notes:** F13 is the hub form — its Part 3 output feeds F14/F15/F16 directly, and Part 5 feeds F23. Consider architecting F13 so Parts 3 and 5 auto-populate from F07/F08 data plus Part 2 computations, rather than requiring re-entry.

---

## F14 — CLO Attainment Summary (Full Term, by Year-Level Cohort)
**Phase:** CHECK | **Retention:** 5 years | **Prepared by:** Faculty → Program Chair

- Section 1: Course Title, Course Code, Academic Year, Semester, Section(s), Date Completed, Program, Year Level/Cohort, Faculty Name, Date Submitted to Program Chair
- Main table — **repeats for Year 1-4** (reusable block): repeating row per CLO: CLO Code, PLO Mapped, CLO Statement (abbreviated), Exam/Quiz Att.(%), Rubric/Project Att.(%), Perf.Task Att.(%), Portfolio Att.(%), Full-Term CLO Att.(%, computed). Cohort Avg row.
- Section 2: Attainment Level Summary — static reference table (Level, Score Range, Descriptor, Institution Action) — read-only guidance
- Footer: Prepared by (Faculty), Reviewed by (Program Chair)

---

## F15 — PLO Attainment Summary (Program Level)
**Phase:** CHECK | **Retention:** 5 years | **Prepared by:** Program Chair → Dean → AQAU

- Section 1: Program, Semester/AY, Program Chair, No. of Courses Assessed, Date of PLO Computation, Data Source (default: "Aggregated CARs — F13")
- Section 2: PLO Attainment Computation Table — repeating row per PLO: PLO Code, PLO Statement, No. of CLOs Mapped, Avg CLO Att. Sem 1 (%), Avg CLO Att. Sem 2 (%), Full-Year PLO Att. (%, computed), Status vs. ≥70% (MET/NOT MET). Program Overall row (computed).
- Section 3: PLO Attainment Narrative Summary — 3 free-text prompts: (1) PLOs MET this term + why, (2) PLOs NOT MET + likely cause, (3) Year 4 Cohort PLO Status narrative
- Footer: Prepared by (Program Chair), Received by (Dean)

---

## F16 — Cohort CLO/PLO Attainment Tracking Sheet (Full AY)
**Phase:** CHECK | **Retention:** Permanent | **Prepared by:** Program Chair → AQAU
*(The core longitudinal tracking instrument)*

- Section 1: Program, Program Chair, Academic Year, Date Prepared, Filed with AQAU (date)
- Main table — repeating row per PLO: PLO Code, PLO Statement (abbreviated), then for **each of Year 1/2/3/4**: CLO Avg (%), I-P-D Stage (checkbox I/I→P/P→D/D, with "N/A" auto-showing if stage is D and not applicable to a lower year), Status (MET✓/NOT MET✗) — plus a single **Trend column** (↑ improved / ↓ declined / → stable, and a CQY = "CQI triggered" flag)
- PROGRAM AVG row (computed across all PLOs)
- Footer: Prepared by (Program Chair), Received by (AQAU)

**Digitization notes:** This form is the direct data source for accreditation evidence — build with strict audit-trail/version history since it's Permanent retention and cited across F15, F22, F24, F25, F26.

---

## F17 — Student Exit Survey Tabulation (by Year-Level Cohort)
**Phase:** CHECK | **Retention:** 5 years | **Prepared by:** Program Office → Program Chair

- Section 1: Program, Semester/AY, Date Administered (before grades), Total Students Enrolled, Total Respondents, Overall Response Rate (%, target ≥70%), Year 1/2/3/4 Respondents (separate counts), Survey Mode (checkbox: In-class/Digital-LMS/Paper)
- Section 2: Tabulation by PLO and Year-Level Cohort — repeating row per PLO: PLO Code, Survey Item text (auto: "I feel I have developed [PLO] through this semester's coursework"), then for **each of Year 1/2/3/4**: Avg Rating (1-5), Divergence flag (OK/FLAG, computed vs. direct CLO attainment). Program Averages/Overall row.
- Section 3: Divergence Investigation Notes (long text) + Qualitative Themes from open-ended items (long text)
- Footer: Tabulated by (Program Office), Received by (Program Chair)

---

## F18 — Portfolio Assessment Record with CLO Evidence (Portfolio Programs)
**Phase:** CHECK | **Retention:** 5 years | **Prepared by:** Faculty Panel → AQAU (copy Program Chair)

- Section 1: Student Name/ID, Program, Year Level/Cohort, Portfolio Event (checkbox: Check-in/Formal Review/Capstone Exhibition), Assessment Date, Portfolio Milestone (from Roadmap), CLO(s) Being Evidenced
- Section 2: Assessor Panel Composition — Assessor 1 & 2 (Faculty), Industry Assessor (required for Y3 formal review/Y4 capstone), Additional Panelist
- Section 3: Rubric Scoring Record — repeating row per criterion (up to 8): #, Rubric Criterion (from F02 Rubric Bank), CLO Mapped, PLO Mapped, Assessor 1 Score (1-4), Assessor 2 Score (1-4), Industry Assessor Score (1-4), Consensus Score (1-4), CLO Attainment % (=consensus÷4×100, computed), Attainment Level badge. Overall row (computed).
- Section 4: Assessor Sign-Off — 3 signature fields (Assessor 1, Assessor 2, Industry Assessor) + Panel Notes (long text)

---

## F19 — Capstone/Culminating Panel Evaluation Sheet
**Phase:** CHECK | **Retention:** 5 years | **Prepared by:** Panel Members → Program Chair → AQAU
*(Primary Year 4 PLO evidence)*

- Section 1: Student Name/ID, Program, Academic Year, Capstone Title, Date of Panel, Venue/Mode, Section/Cohort (Year 4), Capstone Type (checkbox: Project/Thesis/Exhibition/Other), No. of Panel Members (min: 2 Faculty + 1 Industry)
- Section 2: Panel Composition — Panel Chair, Panel Member 2, Industry Assessor (REQUIRED), Additional Member
- Section 3: PLO-Based Rubric Scoring (10-point scale) — repeating row per PLO: PLO Code, PLO Criterion/Rubric Dimension, Panel Chair Score (0-10), Member 2 Score (0-10), Industry Assessor Score (0-10), Additional Member Score (0-10), Consensus Score (0-10), PLO Attainment % (=consensus÷10×100, computed), Attainment Level badge. Overall Average row.
- Section 4: Program-Readiness Declaration — checkbox (Program-Ready / Not Program-Ready + list of PLOs below Proficient), CQI Action Plan entry required Y/N, Panel Notes (long text)
- Footer: 3 signatures (Panel Chair, Panel Member 2, Industry Assessor)

---

## F20 — Alumni Tracer Study Report
**Phase:** CHECK | **Retention:** Permanent | **Prepared by:** Research/Alumni Office → Program Chair → Dean | Biennial

- Section A: Program, Research/Alumni Officer, Academic Year of Survey, Survey Period, Target Graduation Batches, Total Graduates Targeted, Total Respondents, Response Rate (%, target ≥60%), Survey Mode (checkbox: Online/In-Person/Mail)
- Section B: Graduate Employment Profile — 5 fixed indicator rows (Employed in related field within 6mo [benchmark ≥70%], Employed in any field, Self-employed/Entrepreneur, Currently enrolled in grad school, Unemployed/Seeking) × (No. of Respondents, % of Total, Benchmark, AQAU Notes/Action)
- Section C: PLO Sufficiency Ratings — repeating row per PLO: PLO Code, PLO Description, % Rating "Sufficient+" (target ≥70%), % Rating "Insufficient" (flag if ≥30%), Alumni Avg Rating (1-4), Status/CQI Action Needed
- Key Qualitative Findings (long text)
- Footer: Prepared by (Research/Alumni Office), Received by (Program Chair)

---

## F21 — Employer Satisfaction Survey Report
**Phase:** CHECK | **Retention:** Permanent | **Prepared by:** Industry Liaison → Program Chair → Dean | Biennial

- Section A: Program, Industry Liaison, Academic Year of Survey, Survey Period, Employer Organizations Surveyed (target ≥10), Response Rate
- Section B: Employer Profile — repeating row: Employer/Organization Name, Industry/Sector, No. of Program Graduates Employed
- Section C: PLO Competency Satisfaction Ratings — repeating row per PLO: PLO Code, PLO Competency description, Avg Rating (1-4), % Rating Satisfactory+ (target ≥70%), Benchmark Status (MET/NOT MET), Program Flag/CQI Action Required (No Flag/CQI Review/Program Creativity Flag)
- Employer Recommendations (long text)
- Footer: Prepared by (Industry Liaison), Received by (Program Chair)

---

## F22 — PLO Attainment Report with Gap Analysis Matrix (by Cohort)
**Phase:** ACT | **Retention:** 5 years | **Prepared by:** Program Chair → Dean

- Section 1: Program, Program Chair, Academic Year/Semester, Date of Report, End-of-Term Assessment Meeting Date
- Section 2: PLO Attainment by Year-Level Cohort — repeating row per PLO: PLO Code, PLO Statement, Y1/Y2/Y3/Y4 Attainment (%, each validated against ≥70%), Program PLO Avg (%), Status (All MET/Partial/NOT MET), No. of Cohorts NOT MET (computed). Program Average row.
- Section 3: Gap Analysis Matrix — **one row required for EVERY NOT MET PLO-cohort combination**: PLO Code, Cohort/Year Level, Attainment (%), Root Cause Category (6-way select), Root Cause Analysis (specific text — not generic), Named CQI Owner, CQI Action Plan Entry reference (link to F23)
- Program Chair Summary (long text)
- Footer: Prepared by (Program Chair), Received by (Dean)

---

## F23 — CQI Action Plan (One Entry per PLO/Cohort Gap)
**Phase:** ACT | **Retention:** 5 years | **Prepared by:** Program Chair → Dean (approval) → AQAU
*(The living-document core of the ACT phase)*

- Section 1: Program, Semester/AY, Program Chair, Dean Approval Date, Date Distributed to Faculty, No. of CQI Entries This Cycle
- Section 2: CQI Action Plan Entries — repeating row (one per gap): PLO Code, Cohort/Year Level, Attainment (%) & Evidence Source, Root Cause Category (6-way select), Specific Intervention (long text — exact action, not generic — validated against the specificity rule example given in-form), Named Owner (name+role), Timeline & Measurable KPI
- Section 3: CQI Action Completion Tracking (completed at end of following cycle) — repeating row: PLO, Cohort, Intervention Implemented? (Yes/Partial/No), Prior Att.(%), Current Att.(%), Loop Status (CLOSED✓ / OPEN-Re-assess / OPEN-Not Implemented)
- Footer: Prepared by (Program Chair), Approved by (Dean)

**Digitization notes:** This form has a two-phase lifecycle (planned in one cycle, tracked-to-completion in the next) — model as a stateful record with a status field per entry, not a static submitted document. Feeds directly into F09 §3 and F25.

---

## F24 — Annual Program Assessment Report (APAR)
**Phase:** ACT | **Retention:** Permanent | **Prepared by:** Program Chair → Dean → VPAA | Due June 30
*(The comprehensive annual rollup)*

- Section A: Program Title/Specialization, College/Department, Program Chair, Dean, Date Submitted to Dean (June 30), Date Submitted to VPAA (June 30), Date Filed with AQAU
- Section B: Mandatory Attachments Checklist — 9 fixed checkboxes (F16 Cohort Tracking Sheet [mandatory — APAR incomplete without it], F14 both semesters, F15 full year, F23 current+prior cycle, F17 both semesters, F25 CTL Report, F20 if tracer AY, F21 if survey AY, F18 if portfolio program)
- Section C: PLO Attainment Narrative — 5 free-text prompts: C1 Full-Year PLO Summary, C2 Cohort I-P-D Progression Analysis, C3 Indirect Evidence Summary, C4 CQI Interventions Implemented, C5 Recommendations for Next AY (top 3 priorities)
- Section D: Program Performance Dashboard — 11 fixed KPI rows (Overall PLO Attainment, Year 1-4 Cohort Avg CLO Attainment, Capstone Pass Rate, OJT Satisfactory Rating, Portfolio Standard Met, Exit Survey Satisfaction, Alumni Employment [biennial], Employer Satisfaction [biennial], CQI Action Completion Rate) × (Enter Value, Benchmark [mostly ≥70%], Status MET/NOT MET — auto-computed)
- Footer: Prepared by (Program Chair), Endorsed by (Dean)

**Digitization notes:** Section B checklist should be a **validation gate** — block submission if F16 isn't attached, per the explicit rule stated in the form's purpose text.

---

## F25 — Closing-the-Loop (CTL) Report with Identify Section — MANDATORY
**Phase:** ACT | **Retention:** Permanent | **Prepared by:** Program Chair → AQAU | Due end of each AY
*(Non-submission = policy violation)*

- Section A: Program, Program Chair, Academic Year, Date Submitted to AQAU (must be by June 30), AQAU Receipt Date
- Section B: Five Conditions for Loop Closure — repeating row per CQI entry: PLO Code, Cohort/Year Level, Gap Finding & Evidence (cite F22/F15), Root Cause Category, Intervention Implemented (describe — not planned), Prior Att.(%), Current Att.(%, re-assessed) — then a **5-condition checklist per row**: Conditions 1-2 Met? (Y/N), Condition 3 Met? (Y/N), Condition 4 Met? — re-assessment evidence (Y/N), Condition 5 Met? (Y/N) → **Loop Status auto-computed**: CLOSED✓ only if all 5 = Yes; otherwise OPEN-Recheck or OPEN-Not Done
- Section C: Identify Step — Opportunities for Next Cycle (MANDATORY, 4 fixed prompts): C1 Were prior-cycle KPIs achieved?, C2 Any previously-MET PLOs now declining?, C3 New CHED/accreditation/industry shifts?, C4 Proactive improvement opportunities not triggered by failure
- Footer: Submitted by (Program Chair), Received by (AQAU Officer)

**Digitization notes:** The Loop Status field should be a **hard computed/validated field**, not a free checkbox choice — the manual explicitly warns that marking CLOSED without all 5 conditions documented is non-compliant.

---

## F26 — Systemic Gap Report (When Triggered)
**Phase:** ACT | **Retention:** Permanent | **Prepared by:** Dean → PAC + VPAA (copy AQAU) | Within 30 days of 3rd consecutive failure

- Section A: Program, Dean, Program Chair, PLO Code(s) with Systemic Gap, Year-Level Cohort(s) Affected, Cycle Count Below Benchmark (3/4/5+), AY of 1st/2nd/3rd(Trigger) Failure, Date Trigger Identified, Systemic Gap Report Due (auto-computed = trigger date + 30 days)
- Section B: Three-Cycle Evidence Summary — 3 fixed rows (Cycle 1 Earliest, Cycle 2, Cycle 3 Trigger) × (Academic Year/Cycle, PLO Attainment %, Cohort Affected, Benchmark for Cohort, Status [all NOT MET], Interventions Implemented — list from F23) + Evidence Narrative (long text)
- Section C: Root Cause Analysis and Structural Response — Primary Root Cause (long text, from 6-category framework), Recommended Structural Response (checkbox: Curriculum Revision/Faculty Development/Resource Reallocation/External Consultation/Other + description), CAPA Plan Outline (long text: milestones, senior leader, timeline)
- Section D: Submission and Acknowledgment — 3 signatures (Dean, Advisory Board/PAC Chair, VPAA)

---

## F27 — Corrective and Preventive Action (CAPA) Plan
**Phase:** ACT | **Retention:** Permanent | **Prepared by:** Dean/VPAA → AQAU | Before next AY opens

- Section A: Program, PLO(s) Addressed, Cohort(s) Affected, Reference Systemic Gap Report (attach F26), CAPA Start Date, Senior Leader CAPA Owner (name+designation+accountability), Dean, Expected Resolution AY, AQAU Monitoring Frequency (Semestral/Annual)
- Section B: CAPA Actions and Milestones — repeating row (up to 8): #, CAPA Action (specific), Type of Intervention (checkbox: Curriculum Revision/Faculty Development/Resource Reallocation/External Consultation/Policy Change), Named Owner (person, not role), Target Completion Date, Progress (% complete)
- Section C: Progress Monitoring (completed by AQAU at each review) — repeating row per review: Review Date, PLO Attainment at Review (%), Status vs. Benchmark (On Track/At-Risk/Unresolved), Actions Completed (%), AQAU Progress Notes
- CAPA Closure Declaration (long text — required when benchmark sustained 2+ consecutive cycles)
- Footer: Prepared by (Dean), Approved by (VPAA)

---

## F28 — Institutional Management Review Records
**Phase:** ACT | **Retention:** Permanent | **Prepared by:** VPAA/QA Office → President | Due July 15

- Section A: Meeting Date (July 15 or nearest working day), Venue/Mode, Presided by (VPAA), QA Director, Deans Present (list), Deans Absent-excused (list + reason)
- Section B: Program APAR Review Summary — repeating row per program: Program name, Overall PLO Attainment (%), CTL Report Submitted? (Y/N), APAR Complete? (Y/N), Systemic Gap Reported? (Y/N), VPAA/Dean Priority Notes. INSTITUTIONAL TOTAL row (computed: X/Y programs submitted, systemic gaps count)
- Section C: CQI Action Completion Rate — Institutional — repeating row per program: Total CQI Actions Planned, Actions Completed, Completion Rate (%, computed), VPAA Notes/Follow-up. INSTITUTION OVERALL row (target ≥70%)
- Section D: Institutional Decisions and Priorities — 5 fixed long-text prompts: D1 Top 3 Institutional Priorities, D2 CAPA Plans Reviewed & Status, D3 Resource Allocations Approved, D4 Policy Updates/New Provisions, D5 Non-Compliant Programs and action taken
- Section E: Approval and Distribution — Prepared by (QA Director/VPAA), Approved by (School President), Distribution notes (static text)

---

## Cross-Form Data Flow (build this as your relational model)

```
F01 (Curriculum Map) ──┬──> F02 (Portfolio Roadmap, if applicable)
                        ├──> F04 (Target-Setting)
                        └──> F13 §1.1 (CLO-PLO mapping must match F01)

F03 (Calendar) ──> governs timing of all forms below

F07 (Per-Student Raw Data) ──> F08 (Mid-Cycle Summary) ──> F13 (CAR)
F10, F11, F12, F17, F18, F19 (various direct/indirect instruments) ──> F13 §2, §6

F13 (CAR) ──┬──> F14 (Full-Term Summary)
            ├──> F32* (Multi-Section Consolidation — not yet developed)
            └──> Part 5 CQI entries ──> F22 / F23

F14 ──> F15 (PLO Summary) ──> F16 (Cohort Tracking Sheet) ──permanent──> F24 (APAR)

F22 (Gap Analysis) ──> F23 (CQI Action Plan) ──> F09 §3 (implementation monitoring)
                                              ──> F25 (CTL Report, closure evidence)

3+ consecutive NOT MET (from F16) ──> F26 (Systemic Gap Report) ──> F27 (CAPA Plan)

F24 (APAR) + F25 (CTL) + F26 + F27 ──> F28 (Institutional Management Review)

F20 (Alumni Tracer) + F21 (Employer Survey) ──> feed F15 composite computation (§3.5.13: Direct×70% + Indirect×30%) and F24
```

## Suggested Build Priority (if you're digitizing incrementally)
1. **F07** (per-student raw data entry) — the foundational data-capture form everything else depends on
2. **F13** (CAR) — the hub that consolidates a term's data
3. **F14 → F15 → F16** — the roll-up chain (cohort/program/longitudinal)
4. **F22 → F23 → F25** — the CQI/ACT-phase loop
5. **F01, F03, F04, F06** — PLAN-phase setup forms (less frequently touched, but needed to seed the system)
6. **F08, F09, F10, F11, F12, F17, F18, F19** — supporting DO/CHECK instruments
7. **F20, F21, F24, F26, F27, F28** — periodic/escalation/institutional-level forms (lowest frequency, least urgent for MVP)

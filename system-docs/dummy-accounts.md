# Dummy accounts for the deployed app

Additive, idempotent seeding via `just db-seed-accounts-prod` (after `just docker-update` bakes the script into the image). It only creates missing accounts — no program, department, PLO, or other content is changed.

- **Domain:** `@jmc.edu.test`
- **Password (all accounts):** `password123`
- **Rule:** five faculty + five program chairs per program, one dean per department.
- **Existing accounts:** exact email matches are skipped; differently-named existing accounts still count toward the five-per-role cap. Departments that already have a dean are skipped.

Based on the deployed database snapshot taken before seeding. Re-check `user`, `program`, and `department` counts on the VPS before running if the data may have changed.

`EE / Elementary Education` was renamed to `BSED / Bachelor of Secondary Education` on the deployed DB; the account list below uses `bsed-*`. `apps/backend/prisma/program-plos.json` still carries the old `EE` row, so re-running `just db-seed-program-plos-prod` would revert the rename.

## Deans — one per department

| Department | Code | New account | Status |
| ---------- | ---- | ----------- | ------ |
| College of Agriculture | CA | `ca-dean@jmc.edu.test` | new |
| College of Allied Health & Science Education | CAHSE | — | skipped: `cahse-dean@jmc.edu.test` already exists |
| College of Arts & Sciences Education | CASE | `case-dean@jmc.edu.test` | new |
| College of Criminal Justice Education | CCJE | `ccje-dean@jmc.edu.test` | new |
| College of Information Technology Education | CITE | `cite-dean@jmc.edu.test` | new |
| College of Nursing | CON | `con-dean@jmc.edu.test` | new |
| College of Teacher Education | CTE | — | skipped: `cte-dean@jmc.edu.test` already exists |

## Faculty and program chairs — five of each per program

| Department | Program | Faculty accounts | Program chair accounts |
| ---------- | ------- | ---------------- | ---------------------- |
| College of Agriculture | Bachelor of Science in Agriculture (BSA) | `bsa-faculty1@jmc.edu.test`<br>`bsa-faculty2@jmc.edu.test`<br>`bsa-faculty3@jmc.edu.test`<br>`bsa-faculty4@jmc.edu.test`<br>`bsa-faculty5@jmc.edu.test` | `bsa-progchair1@jmc.edu.test`<br>`bsa-progchair2@jmc.edu.test`<br>`bsa-progchair3@jmc.edu.test`<br>`bsa-progchair4@jmc.edu.test`<br>`bsa-progchair5@jmc.edu.test` |
| College of Allied Health & Science Education | Bachelor Science in Medical Technology (BSMT) | `bsmt-faculty2@jmc.edu.test`<br>`bsmt-faculty3@jmc.edu.test`<br>`bsmt-faculty4@jmc.edu.test`<br>`bsmt-faculty5@jmc.edu.test` | `bsmt-progchair1@jmc.edu.test`<br>`bsmt-progchair2@jmc.edu.test`<br>`bsmt-progchair3@jmc.edu.test`<br>`bsmt-progchair4@jmc.edu.test` |
| College of Allied Health & Science Education | Bachelor of Science in Pharmacy (BSP) | `bsp-faculty1@jmc.edu.test`<br>`bsp-faculty2@jmc.edu.test`<br>`bsp-faculty3@jmc.edu.test`<br>`bsp-faculty4@jmc.edu.test`<br>`bsp-faculty5@jmc.edu.test` | `bsp-progchair1@jmc.edu.test`<br>`bsp-progchair2@jmc.edu.test`<br>`bsp-progchair3@jmc.edu.test`<br>`bsp-progchair4@jmc.edu.test`<br>`bsp-progchair5@jmc.edu.test` |
| College of Allied Health & Science Education | Bachelor of Science in Pharmacy (BSPh) | `bsph-faculty1@jmc.edu.test`<br>`bsph-faculty2@jmc.edu.test`<br>`bsph-faculty3@jmc.edu.test`<br>`bsph-faculty4@jmc.edu.test` | `bsph-progchair1@jmc.edu.test`<br>`bsph-progchair2@jmc.edu.test`<br>`bsph-progchair3@jmc.edu.test`<br>`bsph-progchair4@jmc.edu.test` |
| College of Allied Health & Science Education | Bachelor of Science in Radiological Technology (BSRT) | `bsrt-faculty1@jmc.edu.test`<br>`bsrt-faculty2@jmc.edu.test`<br>`bsrt-faculty3@jmc.edu.test` | `bsrt-progchair1@jmc.edu.test`<br>`bsrt-progchair2@jmc.edu.test`<br>`bsrt-progchair3@jmc.edu.test`<br>`bsrt-progchair4@jmc.edu.test` |
| College of Arts & Sciences Education | Bachelor of Science in Psychology (BSPSY) | `bspsy-faculty1@jmc.edu.test`<br>`bspsy-faculty2@jmc.edu.test`<br>`bspsy-faculty3@jmc.edu.test`<br>`bspsy-faculty4@jmc.edu.test`<br>`bspsy-faculty5@jmc.edu.test` | `bspsy-progchair1@jmc.edu.test`<br>`bspsy-progchair2@jmc.edu.test`<br>`bspsy-progchair3@jmc.edu.test`<br>`bspsy-progchair4@jmc.edu.test`<br>`bspsy-progchair5@jmc.edu.test` |
| College of Arts & Sciences Education | Bachelor of Science in Social Work (BSSW) | `bssw-faculty1@jmc.edu.test`<br>`bssw-faculty2@jmc.edu.test`<br>`bssw-faculty3@jmc.edu.test`<br>`bssw-faculty4@jmc.edu.test`<br>`bssw-faculty5@jmc.edu.test` | `bssw-progchair1@jmc.edu.test`<br>`bssw-progchair2@jmc.edu.test`<br>`bssw-progchair3@jmc.edu.test`<br>`bssw-progchair4@jmc.edu.test`<br>`bssw-progchair5@jmc.edu.test` |
| College of Criminal Justice Education | Bachelor of Science in Criminology (BSCRIM) | `bscrim-faculty1@jmc.edu.test`<br>`bscrim-faculty2@jmc.edu.test`<br>`bscrim-faculty3@jmc.edu.test`<br>`bscrim-faculty4@jmc.edu.test`<br>`bscrim-faculty5@jmc.edu.test` | `bscrim-progchair1@jmc.edu.test`<br>`bscrim-progchair2@jmc.edu.test`<br>`bscrim-progchair3@jmc.edu.test`<br>`bscrim-progchair4@jmc.edu.test`<br>`bscrim-progchair5@jmc.edu.test` |
| College of Information Technology Education | Bachelor of Science in Entertainment and Multimedia Computing (BSEMC) | `bsemc-faculty1@jmc.edu.test`<br>`bsemc-faculty2@jmc.edu.test`<br>`bsemc-faculty3@jmc.edu.test`<br>`bsemc-faculty4@jmc.edu.test`<br>`bsemc-faculty5@jmc.edu.test` | `bsemc-progchair1@jmc.edu.test`<br>`bsemc-progchair2@jmc.edu.test`<br>`bsemc-progchair3@jmc.edu.test`<br>`bsemc-progchair4@jmc.edu.test`<br>`bsemc-progchair5@jmc.edu.test` |
| College of Nursing | Bachelor of Science in Nursing (BSN) | `bsn-faculty1@jmc.edu.test`<br>`bsn-faculty2@jmc.edu.test`<br>`bsn-faculty3@jmc.edu.test`<br>`bsn-faculty4@jmc.edu.test`<br>`bsn-faculty5@jmc.edu.test` | `bsn-progchair1@jmc.edu.test`<br>`bsn-progchair2@jmc.edu.test`<br>`bsn-progchair3@jmc.edu.test`<br>`bsn-progchair4@jmc.edu.test`<br>`bsn-progchair5@jmc.edu.test` |
| College of Teacher Education | Bachelor of Elementary Education (BEED) | `beed-faculty1@jmc.edu.test`<br>`beed-faculty2@jmc.edu.test`<br>`beed-faculty3@jmc.edu.test` | `beed-progchair1@jmc.edu.test`<br>`beed-progchair2@jmc.edu.test`<br>`beed-progchair3@jmc.edu.test`<br>`beed-progchair4@jmc.edu.test` |
| College of Teacher Education | Bachelor of Secondary Education (BSED) | `bsed-faculty1@jmc.edu.test`<br>`bsed-faculty2@jmc.edu.test`<br>`bsed-faculty3@jmc.edu.test`<br>`bsed-faculty4@jmc.edu.test`<br>`bsed-faculty5@jmc.edu.test` | `bsed-progchair1@jmc.edu.test`<br>`bsed-progchair2@jmc.edu.test`<br>`bsed-progchair3@jmc.edu.test`<br>`bsed-progchair4@jmc.edu.test`<br>`bsed-progchair5@jmc.edu.test` |

## Totals

| Kind | New accounts |
| ---- | ------------ |
| Deans | 5 |
| Faculty | 54 |
| Program chairs | 56 |
| **Total** | **115** |

Programs with fewer than five new accounts still reach five because existing irregularly-named accounts count toward the cap. The 13 existing dummy accounts and the real system admin are left untouched.

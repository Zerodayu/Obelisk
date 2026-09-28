-- CreateEnum
CREATE TYPE "PloStatus" AS ENUM ('all_met', 'partial', 'not_met');

-- CreateEnum
CREATE TYPE "LoopStatus" AS ENUM ('closed', 'open_reassess', 'open_not_implemented');

-- CreateEnum
CREATE TYPE "CqiEntryStatus" AS ENUM ('planned', 'tracked');

-- CreateEnum
CREATE TYPE "InterventionStatus" AS ENUM ('yes', 'partial', 'no');

-- CreateTable
CREATE TABLE "gap_row" (
    "id" TEXT NOT NULL,
    "plo_gap_analysis_id" TEXT NOT NULL,
    "plo_id" TEXT NOT NULL,
    "cohort_year_level" INTEGER NOT NULL,
    "attainment_pct" DECIMAL(5,2) NOT NULL,
    "root_cause_category" TEXT,
    "root_cause_analysis" TEXT,
    "named_owner" TEXT,
    "cqi_action_plan_entry_id" TEXT,

    CONSTRAINT "gap_row_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cqi_entry" (
    "id" TEXT NOT NULL,
    "cqi_action_plan_id" TEXT NOT NULL,
    "plo_id" TEXT NOT NULL,
    "cohort_year_level" INTEGER NOT NULL,
    "evidence_source" TEXT NOT NULL,
    "prior_attainment_pct" DECIMAL(5,2) NOT NULL,
    "root_cause_category" TEXT NOT NULL,
    "intervention" TEXT NOT NULL,
    "owner_name" TEXT NOT NULL,
    "owner_role" TEXT NOT NULL,
    "timeline_and_kpi" TEXT NOT NULL,
    "status" "CqiEntryStatus" NOT NULL DEFAULT 'planned',
    "intervention_implemented" "InterventionStatus",
    "current_attainment_pct" DECIMAL(5,2),

    CONSTRAINT "cqi_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ctl_row" (
    "id" TEXT NOT NULL,
    "closing_the_loop_id" TEXT NOT NULL,
    "cqi_entry_id" TEXT NOT NULL,
    "gap_finding_and_evidence" TEXT,
    "intervention_implemented_text" TEXT,
    "prior_attainment_pct" DECIMAL(5,2),
    "current_attainment_pct" DECIMAL(5,2),
    "conditions_1_2_met" BOOLEAN NOT NULL DEFAULT false,
    "condition_3_met" BOOLEAN NOT NULL DEFAULT false,
    "condition_4_met" BOOLEAN NOT NULL DEFAULT false,
    "condition_5_met" BOOLEAN NOT NULL DEFAULT false,
    "loop_status" "LoopStatus" NOT NULL DEFAULT 'open_reassess',

    CONSTRAINT "ctl_row_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "gap_row_cqi_action_plan_entry_id_key" ON "gap_row"("cqi_action_plan_entry_id");

-- CreateIndex
CREATE INDEX "gap_row_plo_gap_analysis_id_idx" ON "gap_row"("plo_gap_analysis_id");

-- CreateIndex
CREATE INDEX "gap_row_plo_id_idx" ON "gap_row"("plo_id");

-- CreateIndex
CREATE INDEX "cqi_entry_cqi_action_plan_id_idx" ON "cqi_entry"("cqi_action_plan_id");

-- CreateIndex
CREATE INDEX "cqi_entry_plo_id_idx" ON "cqi_entry"("plo_id");

-- CreateIndex
CREATE UNIQUE INDEX "ctl_row_cqi_entry_id_key" ON "ctl_row"("cqi_entry_id");

-- CreateIndex
CREATE INDEX "ctl_row_closing_the_loop_id_idx" ON "ctl_row"("closing_the_loop_id");

-- AddForeignKey
ALTER TABLE "gap_row" ADD CONSTRAINT "gap_row_plo_id_fkey" FOREIGN KEY ("plo_id") REFERENCES "plo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gap_row" ADD CONSTRAINT "gap_row_plo_gap_analysis_id_fkey" FOREIGN KEY ("plo_gap_analysis_id") REFERENCES "form_submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gap_row" ADD CONSTRAINT "gap_row_cqi_action_plan_entry_id_fkey" FOREIGN KEY ("cqi_action_plan_entry_id") REFERENCES "cqi_entry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cqi_entry" ADD CONSTRAINT "cqi_entry_cqi_action_plan_id_fkey" FOREIGN KEY ("cqi_action_plan_id") REFERENCES "form_submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cqi_entry" ADD CONSTRAINT "cqi_entry_plo_id_fkey" FOREIGN KEY ("plo_id") REFERENCES "plo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ctl_row" ADD CONSTRAINT "ctl_row_closing_the_loop_id_fkey" FOREIGN KEY ("closing_the_loop_id") REFERENCES "form_submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ctl_row" ADD CONSTRAINT "ctl_row_cqi_entry_id_fkey" FOREIGN KEY ("cqi_entry_id") REFERENCES "cqi_entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

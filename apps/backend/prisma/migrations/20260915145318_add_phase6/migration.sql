-- CreateEnum
CREATE TYPE "MidCycleStatus" AS ENUM ('pending', 'met', 'early_warning', 'not_met');

-- CreateEnum
CREATE TYPE "AcquisitionStatus" AS ENUM ('acquired', 'pending', 'not_acquired', 'na');

-- CreateEnum
CREATE TYPE "CqiImplementationStatus" AS ENUM ('fully', 'partially', 'not_yet');

-- CreateTable
CREATE TABLE "mid_cycle_cohort_row" (
    "id" TEXT NOT NULL,
    "mid_cycle_attainment_id" TEXT NOT NULL,
    "year_level" INTEGER NOT NULL,
    "clo_code" TEXT NOT NULL,
    "clo_description" TEXT,
    "attainment_pct" DECIMAL(5,2) NOT NULL,
    "benchmark_pct" DECIMAL(5,2) NOT NULL DEFAULT 70.00,
    "status" "MidCycleStatus" NOT NULL DEFAULT 'pending',
    "student_count" INTEGER NOT NULL DEFAULT 0,
    "below_target_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "mid_cycle_cohort_row_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resource_item_row" (
    "id" TEXT NOT NULL,
    "resource_monitor_id" TEXT NOT NULL,
    "budget_line_item_id" TEXT,
    "name" TEXT NOT NULL,
    "phase" "PdcaPhase" NOT NULL,
    "acquisition_status" "AcquisitionStatus" NOT NULL DEFAULT 'pending',
    "actual_cost" DECIMAL(12,2),
    "notes" TEXT,

    CONSTRAINT "resource_item_row_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cqi_implement_row" (
    "id" TEXT NOT NULL,
    "resource_monitor_id" TEXT NOT NULL,
    "cqi_entry_id" TEXT,
    "intervention_description" TEXT NOT NULL,
    "implementation_status" "CqiImplementationStatus" NOT NULL DEFAULT 'not_yet',
    "evidence_notes" TEXT,

    CONSTRAINT "cqi_implement_row_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exhibition_guest_row" (
    "id" TEXT NOT NULL,
    "exhibition_feedback_id" TEXT NOT NULL,
    "guest_name" TEXT NOT NULL,
    "guest_affiliation" TEXT,
    "plo_ratings" JSONB NOT NULL,
    "overall_comments" TEXT,

    CONSTRAINT "exhibition_guest_row_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolio_criterion_row" (
    "id" TEXT NOT NULL,
    "portfolio_assessment_id" TEXT NOT NULL,
    "clo_code" TEXT NOT NULL,
    "clo_description" TEXT,
    "criterion_name" TEXT NOT NULL,
    "max_score" INTEGER NOT NULL DEFAULT 5,
    "assessor1_score" INTEGER,
    "assessor2_score" INTEGER,
    "industry_score" INTEGER,
    "consensus_score" DECIMAL(5,2),
    "attainment_pct" DECIMAL(5,2),
    "evidence_notes" TEXT,

    CONSTRAINT "portfolio_criterion_row_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "capstone_panelist_row" (
    "id" TEXT NOT NULL,
    "capstone_panel_eval_id" TEXT NOT NULL,
    "panelist_name" TEXT NOT NULL,
    "panelist_role" TEXT NOT NULL,
    "plo_ratings" JSONB NOT NULL,
    "overall_comments" TEXT,

    CONSTRAINT "capstone_panelist_row_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolio_roadmap_row" (
    "id" TEXT NOT NULL,
    "portfolio_roadmap_id" TEXT NOT NULL,
    "year_level" INTEGER NOT NULL,
    "milestone" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "plo_alignment" TEXT,
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "portfolio_roadmap_row_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolio_rubric_row" (
    "id" TEXT NOT NULL,
    "portfolio_roadmap_id" TEXT NOT NULL,
    "criterion_name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "weight_pct" DECIMAL(5,2) NOT NULL,
    "rubric_levels" JSONB NOT NULL,
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "portfolio_rubric_row_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mid_cycle_cohort_row_mid_cycle_attainment_id_idx" ON "mid_cycle_cohort_row"("mid_cycle_attainment_id");

-- CreateIndex
CREATE INDEX "resource_item_row_resource_monitor_id_idx" ON "resource_item_row"("resource_monitor_id");

-- CreateIndex
CREATE INDEX "cqi_implement_row_resource_monitor_id_idx" ON "cqi_implement_row"("resource_monitor_id");

-- CreateIndex
CREATE INDEX "exhibition_guest_row_exhibition_feedback_id_idx" ON "exhibition_guest_row"("exhibition_feedback_id");

-- CreateIndex
CREATE INDEX "portfolio_criterion_row_portfolio_assessment_id_idx" ON "portfolio_criterion_row"("portfolio_assessment_id");

-- CreateIndex
CREATE INDEX "capstone_panelist_row_capstone_panel_eval_id_idx" ON "capstone_panelist_row"("capstone_panel_eval_id");

-- CreateIndex
CREATE INDEX "portfolio_roadmap_row_portfolio_roadmap_id_idx" ON "portfolio_roadmap_row"("portfolio_roadmap_id");

-- CreateIndex
CREATE INDEX "portfolio_rubric_row_portfolio_roadmap_id_idx" ON "portfolio_rubric_row"("portfolio_roadmap_id");

-- AddForeignKey
ALTER TABLE "mid_cycle_cohort_row" ADD CONSTRAINT "mid_cycle_cohort_row_mid_cycle_attainment_id_fkey" FOREIGN KEY ("mid_cycle_attainment_id") REFERENCES "form_submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_item_row" ADD CONSTRAINT "resource_item_row_resource_monitor_id_fkey" FOREIGN KEY ("resource_monitor_id") REFERENCES "form_submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cqi_implement_row" ADD CONSTRAINT "cqi_implement_row_resource_monitor_id_fkey" FOREIGN KEY ("resource_monitor_id") REFERENCES "form_submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exhibition_guest_row" ADD CONSTRAINT "exhibition_guest_row_exhibition_feedback_id_fkey" FOREIGN KEY ("exhibition_feedback_id") REFERENCES "form_submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_criterion_row" ADD CONSTRAINT "portfolio_criterion_row_portfolio_assessment_id_fkey" FOREIGN KEY ("portfolio_assessment_id") REFERENCES "form_submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capstone_panelist_row" ADD CONSTRAINT "capstone_panelist_row_capstone_panel_eval_id_fkey" FOREIGN KEY ("capstone_panel_eval_id") REFERENCES "form_submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_roadmap_row" ADD CONSTRAINT "portfolio_roadmap_row_portfolio_roadmap_id_fkey" FOREIGN KEY ("portfolio_roadmap_id") REFERENCES "form_submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_rubric_row" ADD CONSTRAINT "portfolio_rubric_row_portfolio_roadmap_id_fkey" FOREIGN KEY ("portfolio_roadmap_id") REFERENCES "form_submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

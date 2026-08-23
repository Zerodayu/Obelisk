-- CreateEnum
CREATE TYPE "IpdStage" AS ENUM ('i', 'p', 'd');

-- CreateEnum
CREATE TYPE "CurriculumValidationStatus" AS ENUM ('confirmed', 'pending_review', 'needs_update');

-- CreateEnum
CREATE TYPE "CalendarSection" AS ENUM ('semester1', 'annual_and_semester2', 'program_specific');

-- CreateEnum
CREATE TYPE "PdcaPhase" AS ENUM ('plan', 'do', 'check', 'act');

-- CreateEnum
CREATE TYPE "BudgetSource" AS ENUM ('aqau', 'dean', 'vpaa');

-- AlterTable
ALTER TABLE "clo_to_plo_map" ADD COLUMN     "stage" "IpdStage";

-- CreateTable
CREATE TABLE "plo_directory_row" (
    "id" TEXT NOT NULL,
    "curriculum_map_id" TEXT NOT NULL,
    "plo_id" TEXT,
    "code" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "evidence_sources" TEXT[],
    "d_stage_course" TEXT,
    "validation_status" "CurriculumValidationStatus" NOT NULL DEFAULT 'pending_review',
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "plo_directory_row_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "curriculum_course_row" (
    "id" TEXT NOT NULL,
    "curriculum_map_id" TEXT NOT NULL,
    "year_level" INTEGER NOT NULL,
    "course_code" TEXT NOT NULL,
    "course_title" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "curriculum_course_row_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "curriculum_map_cell" (
    "id" TEXT NOT NULL,
    "course_row_id" TEXT NOT NULL,
    "plo_code" TEXT NOT NULL,
    "plo_id" TEXT,
    "stage" "IpdStage",
    "clo_codes" TEXT,

    CONSTRAINT "curriculum_map_cell_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_event_row" (
    "id" TEXT NOT NULL,
    "assessment_calendar_id" TEXT NOT NULL,
    "section" "CalendarSection" NOT NULL,
    "template_key" TEXT,
    "is_template" BOOLEAN NOT NULL DEFAULT false,
    "period_weeks" TEXT,
    "activity" TEXT NOT NULL,
    "cohort_years" INTEGER[],
    "responsible_party" TEXT,
    "output_forms" TEXT[],
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "calendar_event_row_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plo_target_row" (
    "id" TEXT NOT NULL,
    "target_setting_matrix_id" TEXT NOT NULL,
    "plo_id" TEXT,
    "plo_code" TEXT NOT NULL,
    "statement" TEXT,
    "y1_target_pct" DECIMAL(5,2) NOT NULL,
    "y2_target_pct" DECIMAL(5,2) NOT NULL,
    "y3_target_pct" DECIMAL(5,2) NOT NULL,
    "y4_target_pct" DECIMAL(5,2) NOT NULL,
    "rationale" TEXT,
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "plo_target_row_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_clo_target_row" (
    "id" TEXT NOT NULL,
    "target_setting_matrix_id" TEXT NOT NULL,
    "course_code" TEXT NOT NULL,
    "course_title" TEXT,
    "clo_code" TEXT NOT NULL,
    "y1_target_pct" DECIMAL(5,2),
    "y2_target_pct" DECIMAL(5,2),
    "y3_target_pct" DECIMAL(5,2),
    "y4_target_pct" DECIMAL(5,2),
    "notes" TEXT,
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "course_clo_target_row_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_line_item" (
    "id" TEXT NOT NULL,
    "assessment_budget_id" TEXT NOT NULL,
    "phase" "PdcaPhase" NOT NULL,
    "name" TEXT NOT NULL,
    "is_fixed" BOOLEAN NOT NULL DEFAULT false,
    "estimated_cost" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "approved_cost" DECIMAL(12,2),
    "source" "BudgetSource",
    "notes" TEXT,

    CONSTRAINT "budget_line_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "plo_directory_row_curriculum_map_id_idx" ON "plo_directory_row"("curriculum_map_id");

-- CreateIndex
CREATE INDEX "plo_directory_row_plo_id_idx" ON "plo_directory_row"("plo_id");

-- CreateIndex
CREATE INDEX "curriculum_course_row_curriculum_map_id_idx" ON "curriculum_course_row"("curriculum_map_id");

-- CreateIndex
CREATE INDEX "curriculum_map_cell_plo_id_idx" ON "curriculum_map_cell"("plo_id");

-- CreateIndex
CREATE UNIQUE INDEX "curriculum_map_cell_course_row_id_plo_code_key" ON "curriculum_map_cell"("course_row_id", "plo_code");

-- CreateIndex
CREATE INDEX "calendar_event_row_assessment_calendar_id_idx" ON "calendar_event_row"("assessment_calendar_id");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_event_row_assessment_calendar_id_template_key_key" ON "calendar_event_row"("assessment_calendar_id", "template_key");

-- CreateIndex
CREATE INDEX "plo_target_row_target_setting_matrix_id_idx" ON "plo_target_row"("target_setting_matrix_id");

-- CreateIndex
CREATE INDEX "plo_target_row_plo_id_idx" ON "plo_target_row"("plo_id");

-- CreateIndex
CREATE INDEX "course_clo_target_row_target_setting_matrix_id_idx" ON "course_clo_target_row"("target_setting_matrix_id");

-- CreateIndex
CREATE INDEX "budget_line_item_assessment_budget_id_idx" ON "budget_line_item"("assessment_budget_id");

-- CreateIndex
CREATE UNIQUE INDEX "budget_line_item_assessment_budget_id_name_key" ON "budget_line_item"("assessment_budget_id", "name");

-- AddForeignKey
ALTER TABLE "plo_directory_row" ADD CONSTRAINT "plo_directory_row_curriculum_map_id_fkey" FOREIGN KEY ("curriculum_map_id") REFERENCES "form_submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plo_directory_row" ADD CONSTRAINT "plo_directory_row_plo_id_fkey" FOREIGN KEY ("plo_id") REFERENCES "plo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curriculum_course_row" ADD CONSTRAINT "curriculum_course_row_curriculum_map_id_fkey" FOREIGN KEY ("curriculum_map_id") REFERENCES "form_submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curriculum_map_cell" ADD CONSTRAINT "curriculum_map_cell_course_row_id_fkey" FOREIGN KEY ("course_row_id") REFERENCES "curriculum_course_row"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curriculum_map_cell" ADD CONSTRAINT "curriculum_map_cell_plo_id_fkey" FOREIGN KEY ("plo_id") REFERENCES "plo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_event_row" ADD CONSTRAINT "calendar_event_row_assessment_calendar_id_fkey" FOREIGN KEY ("assessment_calendar_id") REFERENCES "form_submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plo_target_row" ADD CONSTRAINT "plo_target_row_target_setting_matrix_id_fkey" FOREIGN KEY ("target_setting_matrix_id") REFERENCES "form_submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plo_target_row" ADD CONSTRAINT "plo_target_row_plo_id_fkey" FOREIGN KEY ("plo_id") REFERENCES "plo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_clo_target_row" ADD CONSTRAINT "course_clo_target_row_target_setting_matrix_id_fkey" FOREIGN KEY ("target_setting_matrix_id") REFERENCES "form_submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_line_item" ADD CONSTRAINT "budget_line_item_assessment_budget_id_fkey" FOREIGN KEY ("assessment_budget_id") REFERENCES "form_submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

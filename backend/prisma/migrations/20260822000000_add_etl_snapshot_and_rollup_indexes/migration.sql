-- AlterTable
ALTER TABLE "computation_run" ADD COLUMN "etl_snapshot_json" JSONB;

-- CreateIndex
CREATE INDEX "clo_attainment_class_section_id_computation_run_id_idx" ON "clo_attainment"("class_section_id", "computation_run_id");

-- CreateIndex
CREATE INDEX "plo_attainment_program_id_term_id_idx" ON "plo_attainment"("program_id", "term_id");
-- CreateEnum
CREATE TYPE "UploadStatus" AS ENUM ('queued', 'completed', 'failed');

-- CreateTable
CREATE TABLE "upload_record" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "class_section_id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "status" "UploadStatus" NOT NULL DEFAULT 'queued',
    "error" TEXT,
    "etl_job_id" TEXT,
    "computation_run_id" TEXT,
    "summary" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "upload_record_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "upload_record_computation_run_id_key" ON "upload_record"("computation_run_id");

-- CreateIndex
CREATE INDEX "upload_record_user_id_created_at_idx" ON "upload_record"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "upload_record" ADD CONSTRAINT "upload_record_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_record" ADD CONSTRAINT "upload_record_class_section_id_fkey" FOREIGN KEY ("class_section_id") REFERENCES "class_section"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_record" ADD CONSTRAINT "upload_record_computation_run_id_fkey" FOREIGN KEY ("computation_run_id") REFERENCES "computation_run"("id") ON DELETE SET NULL ON UPDATE CASCADE;

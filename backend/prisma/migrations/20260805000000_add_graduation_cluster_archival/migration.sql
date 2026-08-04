-- Graduation-Cluster Archival (compiled, read-only)
-- Adds student lifecycle status, graduation clustering, and permanent
-- read-only compiled snapshot entries.

-- Create new enum types
CREATE TYPE "StudentStatus" AS ENUM ('active', 'irregular', 'transferee', 'graduated', 'transferred_out', 'withdrawn');
CREATE TYPE "GraduationClusterStatus" AS ENUM ('open', 'compiling', 'archived');

-- CreateTable
CREATE TABLE "graduation_cluster" (
    "id" TEXT NOT NULL,
    "program_id" TEXT NOT NULL,
    "graduation_term_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "status" "GraduationClusterStatus" NOT NULL DEFAULT 'open',
    "stats" JSONB NOT NULL DEFAULT '{}',
    "confirmed_by_user_id" TEXT,
    "confirmed_at" TIMESTAMP(3),
    "compiled_at" TIMESTAMP(3),
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "graduation_cluster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "graduation_cluster_entry" (
    "id" TEXT NOT NULL,
    "cluster_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "anonymized_id" TEXT NOT NULL,
    "student_status_at_archive" "StudentStatus" NOT NULL,
    "is_graduation_entry" BOOLEAN NOT NULL DEFAULT true,
    "graduated_at" TIMESTAMP(3),
    "compiled_data" JSONB NOT NULL DEFAULT '{}',
    "detail_artifact_url" TEXT,
    "purged_row_counts" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "graduation_cluster_entry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "graduation_cluster_program_id_graduation_term_id_key" ON "graduation_cluster"("program_id", "graduation_term_id");

-- CreateIndex
CREATE INDEX "graduation_cluster_status_idx" ON "graduation_cluster"("status");

-- CreateIndex
CREATE UNIQUE INDEX "graduation_cluster_entry_student_id_key" ON "graduation_cluster_entry"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "graduation_cluster_entry_cluster_id_anonymized_id_key" ON "graduation_cluster_entry"("cluster_id", "anonymized_id");

-- CreateIndex
CREATE INDEX "graduation_cluster_entry_cluster_id_idx" ON "graduation_cluster_entry"("cluster_id");

-- AlterTable
ALTER TABLE "graduation_cluster" ADD CONSTRAINT "graduation_cluster_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "program"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "graduation_cluster" ADD CONSTRAINT "graduation_cluster_graduation_term_id_fkey" FOREIGN KEY ("graduation_term_id") REFERENCES "academic_term"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "graduation_cluster" ADD CONSTRAINT "graduation_cluster_confirmed_by_user_id_fkey" FOREIGN KEY ("confirmed_by_user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "graduation_cluster_entry" ADD CONSTRAINT "graduation_cluster_entry_cluster_id_fkey" FOREIGN KEY ("cluster_id") REFERENCES "graduation_cluster"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "graduation_cluster_entry" ADD CONSTRAINT "graduation_cluster_entry_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable: student
ALTER TABLE "student" ADD COLUMN "student_status" "StudentStatus" NOT NULL DEFAULT 'active';
ALTER TABLE "student" ADD COLUMN "graduation_term_id" TEXT;
ALTER TABLE "student" ADD COLUMN "graduation_cluster_id" TEXT;
ALTER TABLE "student" ADD CONSTRAINT "student_graduation_term_id_fkey" FOREIGN KEY ("graduation_term_id") REFERENCES "academic_term"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "student" ADD CONSTRAINT "student_graduation_cluster_id_fkey" FOREIGN KEY ("graduation_cluster_id") REFERENCES "graduation_cluster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: peo_attainment (PEO attainment evidence, captured biennially via alumni/employer surveys)
CREATE TABLE "peo_attainment" (
    "id" TEXT NOT NULL,
    "peo_id" TEXT NOT NULL,
    "program_id" TEXT NOT NULL,
    "term_id" TEXT NOT NULL,
    "attained_pct" DECIMAL(5,2) NOT NULL,
    "evidence_json" JSONB NOT NULL DEFAULT '{}',
    "form_submission_id" TEXT,

    CONSTRAINT "peo_attainment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "peo_attainment_peo_id_term_id_key" ON "peo_attainment"("peo_id", "term_id");

-- AlterTable
ALTER TABLE "peo_attainment" ADD CONSTRAINT "peo_attainment_peo_id_fkey" FOREIGN KEY ("peo_id") REFERENCES "peo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "peo_attainment" ADD CONSTRAINT "peo_attainment_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "program"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "peo_attainment" ADD CONSTRAINT "peo_attainment_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "academic_term"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "peo_attainment" ADD CONSTRAINT "peo_attainment_form_submission_id_fkey" FOREIGN KEY ("form_submission_id") REFERENCES "form_submission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: graduation_cluster — gates compile on PEO attainment capture
ALTER TABLE "graduation_cluster" ADD COLUMN "peo_attainment_captured_at" TIMESTAMP(3);

-- AlterTable: graduation_cluster_entry — compiled PEO evidence snapshot
ALTER TABLE "graduation_cluster_entry" ADD COLUMN "peo_attainment" JSONB NOT NULL DEFAULT '{}';
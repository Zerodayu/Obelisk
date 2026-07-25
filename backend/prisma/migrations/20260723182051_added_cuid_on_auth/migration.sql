-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('faculty', 'program_chair', 'dean', 'aqau', 'vpaa', 'system_admin');

-- CreateEnum
CREATE TYPE "AssessmentType" AS ENUM ('direct', 'indirect');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('draft', 'submitted', 'returned', 'approved', 'archived');

-- CreateEnum
CREATE TYPE "ApprovalDecision" AS ENUM ('pending', 'approved', 'returned');

-- CreateEnum
CREATE TYPE "ApproverRole" AS ENUM ('program_chair', 'dean', 'aqau', 'vpaa');

-- CreateEnum
CREATE TYPE "RecommendationStatus" AS ENUM ('pending_review', 'acknowledged', 'actioned', 'dismissed');

-- CreateEnum
CREATE TYPE "ExportFormat" AS ENUM ('pdf', 'excel', 'word');

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'faculty',
    "employee_id" TEXT,
    "program_id" TEXT,
    "department_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "access_token" TEXT,
    "refresh_token" TEXT,
    "id_token" TEXT,
    "access_token_expires_at" TIMESTAMP(3),
    "refresh_token_expires_at" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "department" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "dean_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "program" (
    "id" TEXT NOT NULL,
    "department_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "program_chair_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "program_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_term" (
    "id" TEXT NOT NULL,
    "school_year" TEXT NOT NULL,
    "semester" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),

    CONSTRAINT "academic_term_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course" (
    "id" TEXT NOT NULL,
    "program_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "units" DECIMAL(3,1),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_section" (
    "id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "term_id" TEXT NOT NULL,
    "faculty_id" TEXT,
    "section_code" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "class_section_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student" (
    "id" TEXT NOT NULL,
    "student_number" TEXT NOT NULL,
    "program_id" TEXT NOT NULL,
    "year_level" INTEGER,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "anonymized_id" TEXT NOT NULL,

    CONSTRAINT "student_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrollment" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "class_section_id" TEXT NOT NULL,

    CONSTRAINT "enrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clo" (
    "id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "clo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plo" (
    "id" TEXT NOT NULL,
    "program_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "target_attainment_pct" DECIMAL(5,2) NOT NULL DEFAULT 70.00,

    CONSTRAINT "plo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "peo" (
    "id" TEXT NOT NULL,
    "program_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "peo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clo_to_plo_map" (
    "id" TEXT NOT NULL,
    "clo_id" TEXT NOT NULL,
    "plo_id" TEXT NOT NULL,
    "weight" DECIMAL(4,3) NOT NULL DEFAULT 1.000,

    CONSTRAINT "clo_to_plo_map_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plo_to_peo_map" (
    "id" TEXT NOT NULL,
    "plo_id" TEXT NOT NULL,
    "peo_id" TEXT NOT NULL,

    CONSTRAINT "plo_to_peo_map_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_item" (
    "id" TEXT NOT NULL,
    "class_section_id" TEXT NOT NULL,
    "clo_id" TEXT NOT NULL,
    "type" "AssessmentType" NOT NULL,
    "title" TEXT NOT NULL,
    "max_score" DECIMAL(7,2) NOT NULL,
    "weight_pct" DECIMAL(5,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessment_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_score" (
    "id" TEXT NOT NULL,
    "assessment_item_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "raw_score" DECIMAL(7,2) NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_score_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "form_type" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pdca_stage" TEXT NOT NULL,
    "sequence_no" INTEGER NOT NULL,

    CONSTRAINT "form_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "form_submission" (
    "id" TEXT NOT NULL,
    "form_type_id" TEXT NOT NULL,
    "class_section_id" TEXT,
    "program_id" TEXT,
    "term_id" TEXT NOT NULL,
    "submitted_by_user_id" TEXT,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'draft',
    "current_approver_role" "ApproverRole",
    "form_data" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "form_submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_step" (
    "id" TEXT NOT NULL,
    "form_submission_id" TEXT NOT NULL,
    "approver_role" "ApproverRole" NOT NULL,
    "sequence_no" INTEGER NOT NULL,
    "approver_user_id" TEXT,
    "decision" "ApprovalDecision" NOT NULL DEFAULT 'pending',
    "comment" TEXT,
    "decided_at" TIMESTAMP(3),

    CONSTRAINT "approval_step_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "computation_run" (
    "id" TEXT NOT NULL,
    "triggered_by_user_id" TEXT,
    "scope" TEXT NOT NULL,
    "formula_version" TEXT NOT NULL DEFAULT '70_30_v1',
    "direct_weight" DECIMAL(3,2) NOT NULL DEFAULT 0.70,
    "indirect_weight" DECIMAL(3,2) NOT NULL DEFAULT 0.30,
    "run_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "computation_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clo_attainment" (
    "id" TEXT NOT NULL,
    "class_section_id" TEXT NOT NULL,
    "clo_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "direct_score_pct" DECIMAL(5,2),
    "indirect_score_pct" DECIMAL(5,2),
    "composite_score_pct" DECIMAL(5,2) NOT NULL,
    "is_below_threshold" BOOLEAN NOT NULL DEFAULT false,
    "computation_run_id" TEXT NOT NULL,
    "form_submission_id" TEXT,

    CONSTRAINT "clo_attainment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plo_attainment" (
    "id" TEXT NOT NULL,
    "plo_id" TEXT NOT NULL,
    "program_id" TEXT NOT NULL,
    "term_id" TEXT NOT NULL,
    "attained_pct" DECIMAL(5,2) NOT NULL,
    "students_below_target_count" INTEGER NOT NULL DEFAULT 0,
    "computation_run_id" TEXT NOT NULL,
    "form_submission_id" TEXT,

    CONSTRAINT "plo_attainment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "action" TEXT NOT NULL,
    "module_affected" TEXT NOT NULL,
    "target_record_id" TEXT,
    "details" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "at_risk_flag" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "clo_attainment_id" TEXT,
    "reason" TEXT NOT NULL,
    "flagged_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "at_risk_flag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_recommendation" (
    "id" TEXT NOT NULL,
    "program_id" TEXT,
    "term_id" TEXT,
    "plo_id" TEXT,
    "summary" TEXT NOT NULL,
    "recommendation_text" TEXT NOT NULL,
    "source_data_snapshot" JSONB NOT NULL DEFAULT '{}',
    "status" "RecommendationStatus" NOT NULL DEFAULT 'pending_review',
    "reviewed_by_user_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_recommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_export" (
    "id" TEXT NOT NULL,
    "form_submission_id" TEXT,
    "exported_by_user_id" TEXT,
    "format" "ExportFormat" NOT NULL,
    "file_url" TEXT NOT NULL,
    "exported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_export_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_employee_id_key" ON "user"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE UNIQUE INDEX "department_code_key" ON "department"("code");

-- CreateIndex
CREATE UNIQUE INDEX "program_code_key" ON "program"("code");

-- CreateIndex
CREATE UNIQUE INDEX "academic_term_school_year_semester_key" ON "academic_term"("school_year", "semester");

-- CreateIndex
CREATE UNIQUE INDEX "course_program_id_code_key" ON "course"("program_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "class_section_course_id_term_id_section_code_key" ON "class_section"("course_id", "term_id", "section_code");

-- CreateIndex
CREATE UNIQUE INDEX "student_student_number_key" ON "student"("student_number");

-- CreateIndex
CREATE UNIQUE INDEX "student_anonymized_id_key" ON "student"("anonymized_id");

-- CreateIndex
CREATE UNIQUE INDEX "enrollment_student_id_class_section_id_key" ON "enrollment"("student_id", "class_section_id");

-- CreateIndex
CREATE UNIQUE INDEX "clo_to_plo_map_clo_id_plo_id_key" ON "clo_to_plo_map"("clo_id", "plo_id");

-- CreateIndex
CREATE UNIQUE INDEX "plo_to_peo_map_plo_id_peo_id_key" ON "plo_to_peo_map"("plo_id", "peo_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_score_assessment_item_id_student_id_key" ON "student_score"("assessment_item_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "form_type_code_key" ON "form_type"("code");

-- CreateIndex
CREATE INDEX "form_submission_status_idx" ON "form_submission"("status");

-- CreateIndex
CREATE UNIQUE INDEX "approval_step_form_submission_id_sequence_no_key" ON "approval_step"("form_submission_id", "sequence_no");

-- CreateIndex
CREATE INDEX "clo_attainment_is_below_threshold_idx" ON "clo_attainment"("is_below_threshold");

-- CreateIndex
CREATE UNIQUE INDEX "clo_attainment_class_section_id_clo_id_student_id_computati_key" ON "clo_attainment"("class_section_id", "clo_id", "student_id", "computation_run_id");

-- CreateIndex
CREATE UNIQUE INDEX "plo_attainment_plo_id_program_id_term_id_computation_run_id_key" ON "plo_attainment"("plo_id", "program_id", "term_id", "computation_run_id");

-- CreateIndex
CREATE INDEX "audit_log_user_id_idx" ON "audit_log"("user_id");

-- CreateIndex
CREATE INDEX "audit_log_created_at_idx" ON "audit_log"("created_at");

-- CreateIndex
CREATE INDEX "ai_recommendation_status_idx" ON "ai_recommendation"("status");

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "program"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "department" ADD CONSTRAINT "department_dean_id_fkey" FOREIGN KEY ("dean_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "program" ADD CONSTRAINT "program_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "program" ADD CONSTRAINT "program_program_chair_id_fkey" FOREIGN KEY ("program_chair_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course" ADD CONSTRAINT "course_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_section" ADD CONSTRAINT "class_section_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_section" ADD CONSTRAINT "class_section_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "academic_term"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_section" ADD CONSTRAINT "class_section_faculty_id_fkey" FOREIGN KEY ("faculty_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student" ADD CONSTRAINT "student_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollment" ADD CONSTRAINT "enrollment_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollment" ADD CONSTRAINT "enrollment_class_section_id_fkey" FOREIGN KEY ("class_section_id") REFERENCES "class_section"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clo" ADD CONSTRAINT "clo_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plo" ADD CONSTRAINT "plo_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "peo" ADD CONSTRAINT "peo_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clo_to_plo_map" ADD CONSTRAINT "clo_to_plo_map_clo_id_fkey" FOREIGN KEY ("clo_id") REFERENCES "clo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clo_to_plo_map" ADD CONSTRAINT "clo_to_plo_map_plo_id_fkey" FOREIGN KEY ("plo_id") REFERENCES "plo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plo_to_peo_map" ADD CONSTRAINT "plo_to_peo_map_plo_id_fkey" FOREIGN KEY ("plo_id") REFERENCES "plo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plo_to_peo_map" ADD CONSTRAINT "plo_to_peo_map_peo_id_fkey" FOREIGN KEY ("peo_id") REFERENCES "peo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_item" ADD CONSTRAINT "assessment_item_class_section_id_fkey" FOREIGN KEY ("class_section_id") REFERENCES "class_section"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_item" ADD CONSTRAINT "assessment_item_clo_id_fkey" FOREIGN KEY ("clo_id") REFERENCES "clo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_score" ADD CONSTRAINT "student_score_assessment_item_id_fkey" FOREIGN KEY ("assessment_item_id") REFERENCES "assessment_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_score" ADD CONSTRAINT "student_score_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_submission" ADD CONSTRAINT "form_submission_form_type_id_fkey" FOREIGN KEY ("form_type_id") REFERENCES "form_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_submission" ADD CONSTRAINT "form_submission_class_section_id_fkey" FOREIGN KEY ("class_section_id") REFERENCES "class_section"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_submission" ADD CONSTRAINT "form_submission_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_submission" ADD CONSTRAINT "form_submission_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "academic_term"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_submission" ADD CONSTRAINT "form_submission_submitted_by_user_id_fkey" FOREIGN KEY ("submitted_by_user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_step" ADD CONSTRAINT "approval_step_form_submission_id_fkey" FOREIGN KEY ("form_submission_id") REFERENCES "form_submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_step" ADD CONSTRAINT "approval_step_approver_user_id_fkey" FOREIGN KEY ("approver_user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "computation_run" ADD CONSTRAINT "computation_run_triggered_by_user_id_fkey" FOREIGN KEY ("triggered_by_user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clo_attainment" ADD CONSTRAINT "clo_attainment_class_section_id_fkey" FOREIGN KEY ("class_section_id") REFERENCES "class_section"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clo_attainment" ADD CONSTRAINT "clo_attainment_clo_id_fkey" FOREIGN KEY ("clo_id") REFERENCES "clo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clo_attainment" ADD CONSTRAINT "clo_attainment_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clo_attainment" ADD CONSTRAINT "clo_attainment_computation_run_id_fkey" FOREIGN KEY ("computation_run_id") REFERENCES "computation_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clo_attainment" ADD CONSTRAINT "clo_attainment_form_submission_id_fkey" FOREIGN KEY ("form_submission_id") REFERENCES "form_submission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plo_attainment" ADD CONSTRAINT "plo_attainment_plo_id_fkey" FOREIGN KEY ("plo_id") REFERENCES "plo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plo_attainment" ADD CONSTRAINT "plo_attainment_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plo_attainment" ADD CONSTRAINT "plo_attainment_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "academic_term"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plo_attainment" ADD CONSTRAINT "plo_attainment_computation_run_id_fkey" FOREIGN KEY ("computation_run_id") REFERENCES "computation_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plo_attainment" ADD CONSTRAINT "plo_attainment_form_submission_id_fkey" FOREIGN KEY ("form_submission_id") REFERENCES "form_submission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "at_risk_flag" ADD CONSTRAINT "at_risk_flag_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "at_risk_flag" ADD CONSTRAINT "at_risk_flag_clo_attainment_id_fkey" FOREIGN KEY ("clo_attainment_id") REFERENCES "clo_attainment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_recommendation" ADD CONSTRAINT "ai_recommendation_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_recommendation" ADD CONSTRAINT "ai_recommendation_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "academic_term"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_recommendation" ADD CONSTRAINT "ai_recommendation_plo_id_fkey" FOREIGN KEY ("plo_id") REFERENCES "plo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_recommendation" ADD CONSTRAINT "ai_recommendation_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_export" ADD CONSTRAINT "report_export_form_submission_id_fkey" FOREIGN KEY ("form_submission_id") REFERENCES "form_submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_export" ADD CONSTRAINT "report_export_exported_by_user_id_fkey" FOREIGN KEY ("exported_by_user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { academicTerm } from "./academic-term";
import { classSection } from "./class-section";
import { approverRoleEnum, submissionStatusEnum } from "./enums";
import { formType } from "./form-type";
import { program } from "./program";
import { user } from "./user";

// An actual instance of a form, tied to a class section (course-level) or
// program/term (program-level) submission.
export const formSubmission = pgTable(
	"form_submission",
	{
		id: text("id").primaryKey(),
		formTypeId: text("form_type_id")
			.notNull()
			.references(() => formType.id, { onDelete: "restrict" }),
		classSectionId: text("class_section_id").references(() => classSection.id, {
			onDelete: "cascade",
		}), // nullable: program-level forms have no section
		programId: text("program_id").references(() => program.id, {
			onDelete: "cascade",
		}),
		termId: text("term_id")
			.notNull()
			.references(() => academicTerm.id, { onDelete: "cascade" }),
		submittedByUserId: text("submitted_by_user_id")
			.notNull()
			.references(() => user.id, { onDelete: "set null" }),
		status: submissionStatusEnum("status").notNull().default("draft"),
		currentApproverRole: approverRoleEnum("current_approver_role"), // null once fully approved
		formData: jsonb("form_data").notNull().default(sql`'{}'::jsonb`), // computed/rendered form payload
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at").notNull().defaultNow(),
	},
	(t) => [index("idx_submission_status").on(t.status)],
);

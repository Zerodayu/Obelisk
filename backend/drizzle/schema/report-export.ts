import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { exportFormatEnum } from "./enums";
import { formSubmission } from "./form-submission";
import { user } from "./user";

export const reportExport = pgTable("report_export", {
	id: text("id").primaryKey(),
	formSubmissionId: text("form_submission_id").references(
		() => formSubmission.id,
		{ onDelete: "cascade" },
	),
	exportedByUserId: text("exported_by_user_id")
		.notNull()
		.references(() => user.id, { onDelete: "set null" }),
	format: exportFormatEnum("format").notNull(),
	fileUrl: text("file_url").notNull(),
	exportedAt: timestamp("exported_at").notNull().defaultNow(),
});

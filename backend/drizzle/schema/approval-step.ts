import {
	integer,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { approvalDecisionEnum, approverRoleEnum } from "./enums";
import { formSubmission } from "./form-submission";
import { user } from "./user";

// Every step of the Faculty -> PC -> Dean -> AQAU -> VPAA chain.
// "No level skipped" is enforced at the application layer via sequenceNo + decision.
export const approvalStep = pgTable(
	"approval_step",
	{
		id: text("id").primaryKey(),
		formSubmissionId: text("form_submission_id")
			.notNull()
			.references(() => formSubmission.id, { onDelete: "cascade" }),
		approverRole: approverRoleEnum("approver_role").notNull(),
		sequenceNo: integer("sequence_no").notNull(), // 1=PC, 2=Dean, 3=AQAU, 4=VPAA
		approverUserId: text("approver_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		decision: approvalDecisionEnum("decision").notNull().default("pending"),
		comment: text("comment"),
		decidedAt: timestamp("decided_at"),
	},
	(t) => [
		uniqueIndex("uniq_approval_step").on(t.formSubmissionId, t.sequenceNo),
	],
);

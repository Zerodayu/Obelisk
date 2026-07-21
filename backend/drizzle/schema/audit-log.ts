import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./user";

export const auditLog = pgTable(
	"audit_log",
	{
		id: text("id").primaryKey(),
		userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
		action: text("action").notNull(), // "uploaded_class_record", "approved_submission", ...
		moduleAffected: text("module_affected").notNull(), // "form_submission", "clo_attainment", ...
		targetRecordId: text("target_record_id"), // polymorphic reference, no FK by design
		details: jsonb("details").notNull().default(sql`'{}'::jsonb`),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(t) => [
		index("idx_audit_user").on(t.userId),
		index("idx_audit_created_at").on(t.createdAt),
	],
);

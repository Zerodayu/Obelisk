import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { cloAttainment } from "./clo-attainment";
import { student } from "./student";

export const atRiskFlag = pgTable("at_risk_flag", {
	id: text("id").primaryKey(),
	studentId: text("student_id")
		.notNull()
		.references(() => student.id, { onDelete: "cascade" }),
	cloAttainmentId: text("clo_attainment_id").references(
		() => cloAttainment.id,
		{ onDelete: "cascade" },
	),
	reason: text("reason").notNull(), // e.g. "CLO2 below 70% threshold"
	flaggedAt: timestamp("flagged_at").notNull().defaultNow(),
});

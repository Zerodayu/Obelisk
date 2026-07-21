import {
	numeric,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { assessmentItem } from "./assessment-item";
import { student } from "./student";

// Raw uploaded scores (source: faculty class record CSV upload)
export const studentScore = pgTable(
	"student_score",
	{
		id: text("id").primaryKey(),
		assessmentItemId: text("assessment_item_id")
			.notNull()
			.references(() => assessmentItem.id, { onDelete: "cascade" }),
		studentId: text("student_id")
			.notNull()
			.references(() => student.id, { onDelete: "cascade" }),
		rawScore: numeric("raw_score", { precision: 7, scale: 2 }).notNull(),
		uploadedAt: timestamp("uploaded_at").notNull().defaultNow(),
	},
	(t) => [uniqueIndex("uniq_score").on(t.assessmentItemId, t.studentId)],
);

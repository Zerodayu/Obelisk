import { numeric, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { classSection } from "./class-section";
import { clo } from "./clo";
import { assessmentTypeEnum } from "./enums";

// Direct (exams, quizzes, projects) or indirect (surveys, evaluations) evidence
export const assessmentItem = pgTable("assessment_item", {
	id: text("id").primaryKey(),
	classSectionId: text("class_section_id")
		.notNull()
		.references(() => classSection.id, { onDelete: "cascade" }),
	cloId: text("clo_id")
		.notNull()
		.references(() => clo.id, { onDelete: "cascade" }),
	type: assessmentTypeEnum("type").notNull(),
	title: text("title").notNull(), // "Midterm Exam", "Course Exit Survey"
	maxScore: numeric("max_score", { precision: 7, scale: 2 }).notNull(),
	weightPct: numeric("weight_pct", { precision: 5, scale: 2 }).notNull(),
	// weightPct sums to 100 within each type (direct set / indirect set) per CLO
	createdAt: timestamp("created_at").notNull().defaultNow(),
});

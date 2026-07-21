import {
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	varchar,
} from "drizzle-orm/pg-core";
import { academicTerm } from "./academic-term";
import { course } from "./course";
import { user } from "./user";

export const classSection = pgTable(
	"class_section",
	{
		id: text("id").primaryKey(),
		courseId: text("course_id")
			.notNull()
			.references(() => course.id, { onDelete: "cascade" }),
		termId: text("term_id")
			.notNull()
			.references(() => academicTerm.id, { onDelete: "cascade" }),
		facultyId: text("faculty_id")
			.notNull()
			.references(() => user.id, { onDelete: "set null" }),
		sectionCode: varchar("section_code", { length: 20 }).notNull(), // "A", "B"
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(t) => [uniqueIndex("uniq_section").on(t.courseId, t.termId, t.sectionCode)],
);

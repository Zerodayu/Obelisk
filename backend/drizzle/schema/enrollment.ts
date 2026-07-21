import { pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { classSection } from "./class-section";
import { student } from "./student";

export const enrollment = pgTable(
	"enrollment",
	{
		id: text("id").primaryKey(),
		studentId: text("student_id")
			.notNull()
			.references(() => student.id, { onDelete: "cascade" }),
		classSectionId: text("class_section_id")
			.notNull()
			.references(() => classSection.id, { onDelete: "cascade" }),
	},
	(t) => [uniqueIndex("uniq_enrollment").on(t.studentId, t.classSectionId)],
);

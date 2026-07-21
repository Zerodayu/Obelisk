import { pgTable, text, varchar } from "drizzle-orm/pg-core";
import { course } from "./course";

export const clo = pgTable("clo", {
	id: text("id").primaryKey(),
	courseId: text("course_id")
		.notNull()
		.references(() => course.id, { onDelete: "cascade" }),
	code: varchar("code", { length: 20 }).notNull(), // "CLO1"
	description: text("description").notNull(),
});

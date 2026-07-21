import { pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { department } from "./department";
import { user } from "./user";

export const program = pgTable("program", {
	id: text("id").primaryKey(),
	departmentId: text("department_id")
		.notNull()
		.references(() => department.id, { onDelete: "cascade" }),
	name: text("name").notNull(), // e.g. "BS Information Technology"
	code: varchar("code", { length: 20 }).notNull().unique(), // e.g. "BSIT"
	programChairId: text("program_chair_id").references(() => user.id, {
		onDelete: "set null",
	}),
	createdAt: timestamp("created_at").notNull().defaultNow(),
});

import { pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { user } from "./user";

export const department = pgTable("department", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	code: varchar("code", { length: 20 }).notNull().unique(), // e.g. "CITE"
	deanId: text("dean_id").references(() => user.id, { onDelete: "set null" }),
	createdAt: timestamp("created_at").notNull().defaultNow(),
});

import { integer, pgTable, text, varchar } from "drizzle-orm/pg-core";

// Lookup/config for the 37 WIN-OBE form definitions (not 37 tables)
export const formType = pgTable("form_type", {
	id: text("id").primaryKey(),
	code: varchar("code", { length: 20 }).notNull().unique(), // "WIN-OBE-F12"
	name: text("name").notNull(), // "Course Assessment Report"
	pdcaStage: varchar("pdca_stage", { length: 20 }).notNull(), // Plan/Do/Check/Act
	sequenceNo: integer("sequence_no").notNull(), // 1-37 ordering
});

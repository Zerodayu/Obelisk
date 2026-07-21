import {
	boolean,
	pgTable,
	text,
	timestamp,
	varchar,
} from "drizzle-orm/pg-core";
import { department } from "./department";
import { userRoleEnum } from "./enums";
import { program } from "./program";

const userColumns = {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	email: text("email").notNull().unique(),
	emailVerified: boolean("email_verified").notNull().default(false),
	image: text("image"),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow(),

	// --- Institutional extensions (not part of Better Auth core) ---
	role: userRoleEnum("role").notNull().default("faculty"),
	employeeId: varchar("employee_id", { length: 50 }).unique(),
	programId: text("program_id"),
	departmentId: text("department_id"),
	isActive: boolean("is_active").notNull().default(true),
} as const;

/**
 * Better Auth core `user` table, extended with institutional fields
 * (role, program/department linkage) rather than a separate profile table —
 * keeps role-based dashboard queries a single join.
 */
const _user = pgTable("user", userColumns);

export const user: typeof _user = pgTable("user", {
	...userColumns,
	programId: text("program_id").references(() => program.id, {
		onDelete: "set null",
	}),
	departmentId: text("department_id").references(() => department.id, {
		onDelete: "set null",
	}),
});

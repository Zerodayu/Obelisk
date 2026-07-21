import { pgEnum } from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", [
	"faculty",
	"program_chair",
	"dean",
	"aqau",
	"vpaa",
	"system_admin",
]);

export const assessmentTypeEnum = pgEnum("assessment_type", [
	"direct",
	"indirect",
]);

export const submissionStatusEnum = pgEnum("submission_status", [
	"draft",
	"submitted",
	"returned",
	"approved",
	"archived",
]);

export const approvalDecisionEnum = pgEnum("approval_decision", [
	"pending",
	"approved",
	"returned",
]);

export const approverRoleEnum = pgEnum("approver_role", [
	"program_chair",
	"dean",
	"aqau",
	"vpaa",
]);

export const recommendationStatusEnum = pgEnum("recommendation_status", [
	"pending_review",
	"acknowledged",
	"actioned",
	"dismissed",
]);

export const exportFormatEnum = pgEnum("export_format", [
	"pdf",
	"excel",
	"word",
]);

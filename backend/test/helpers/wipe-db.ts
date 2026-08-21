import { prisma } from "@lib/prisma";
import { isDbReachable } from "./db-gate";

/** Every table in the schema (snake_case `@@map` names), kept in sync with prisma/schema. */
const TABLES = [
	// auth
	"user",
	"session",
	"account",
	"verification",
	// academic
	"department",
	"program",
	"academic_term",
	"course",
	"class_section",
	"student",
	"enrollment",
	// outcomes
	"clo",
	"plo",
	"peo",
	"clo_to_plo_map",
	"plo_to_peo_map",
	// assessment
	"assessment_item",
	"student_score",
	// forms
	"form_type",
	"form_submission",
	"approval_step",
	// monitoring
	"audit_log",
	"at_risk_flag",
	"ai_recommendation",
	// reports
	"report_export",
	// archive
	"graduation_cluster",
	"graduation_cluster_entry",
	// attainment
	"computation_run",
	"upload_record",
	"clo_attainment",
	"plo_attainment",
	"peo_attainment",
	// cqi
	"gap_row",
	"cqi_entry",
	"ctl_row",
] as const;

/**
 * Wipes every row from every table (TRUNCATE ... CASCADE — atomic, FK-safe).
 * Silently no-ops when the dev database is unreachable so the suite stays
 * green offline.
 */
export async function wipeTestDatabase(): Promise<void> {
	if (!(await isDbReachable())) return;

	await prisma.$transaction(
		async (tx) => {
			await tx.$executeRawUnsafe(
				`TRUNCATE TABLE ${TABLES.map((t) => `"${t}"`).join(", ")} CASCADE`,
			);
		},
		{ timeout: 30000 },
	);
}

if (import.meta.main) {
	await wipeTestDatabase();
	console.log(`Wiped ${TABLES.length} tables.`);
}

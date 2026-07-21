import {
	integer,
	numeric,
	pgTable,
	text,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { academicTerm } from "./academic-term";
import { computationRun } from "./computation-run";
import { plo } from "./plo";
import { program } from "./program";

// Aggregated PLO attainment per program per term (rollup of CLO -> PLO)
export const ploAttainment = pgTable(
	"plo_attainment",
	{
		id: text("id").primaryKey(),
		ploId: text("plo_id")
			.notNull()
			.references(() => plo.id, { onDelete: "cascade" }),
		programId: text("program_id")
			.notNull()
			.references(() => program.id, { onDelete: "cascade" }),
		termId: text("term_id")
			.notNull()
			.references(() => academicTerm.id, { onDelete: "cascade" }),
		attainedPct: numeric("attained_pct", { precision: 5, scale: 2 }).notNull(),
		studentsBelowTargetCount: integer("students_below_target_count")
			.notNull()
			.default(0),
		computationRunId: text("computation_run_id")
			.notNull()
			.references(() => computationRun.id, { onDelete: "cascade" }),
	},
	(t) => [
		uniqueIndex("uniq_plo_attainment").on(
			t.ploId,
			t.programId,
			t.termId,
			t.computationRunId,
		),
	],
);

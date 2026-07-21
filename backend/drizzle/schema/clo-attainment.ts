import {
	boolean,
	index,
	numeric,
	pgTable,
	text,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { classSection } from "./class-section";
import { clo } from "./clo";
import { computationRun } from "./computation-run";
import { student } from "./student";

// Computed per-student, per-CLO, per-section attainment (applies 70/30 formula)
export const cloAttainment = pgTable(
	"clo_attainment",
	{
		id: text("id").primaryKey(),
		classSectionId: text("class_section_id")
			.notNull()
			.references(() => classSection.id, { onDelete: "cascade" }),
		cloId: text("clo_id")
			.notNull()
			.references(() => clo.id, { onDelete: "cascade" }),
		studentId: text("student_id")
			.notNull()
			.references(() => student.id, { onDelete: "cascade" }),
		directScorePct: numeric("direct_score_pct", { precision: 5, scale: 2 }),
		indirectScorePct: numeric("indirect_score_pct", { precision: 5, scale: 2 }),
		compositeScorePct: numeric("composite_score_pct", {
			precision: 5,
			scale: 2,
		}).notNull(), // = direct*0.70 + indirect*0.30
		isBelowThreshold: boolean("is_below_threshold").notNull().default(false), // <70%
		computationRunId: text("computation_run_id")
			.notNull()
			.references(() => computationRun.id, { onDelete: "cascade" }),
	},
	(t) => [
		uniqueIndex("uniq_clo_attainment").on(
			t.classSectionId,
			t.cloId,
			t.studentId,
			t.computationRunId,
		),
		index("idx_below_threshold").on(t.isBelowThreshold),
	],
);

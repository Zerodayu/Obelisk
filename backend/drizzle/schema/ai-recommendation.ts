import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { academicTerm } from "./academic-term";
import { recommendationStatusEnum } from "./enums";
import { plo } from "./plo";
import { program } from "./program";
import { user } from "./user";

// Advisory only — never writes to attainment records. All output requires
// mandatory human review (AQAU/VPAA) before any CQI action is taken.
export const aiRecommendation = pgTable(
	"ai_recommendation",
	{
		id: text("id").primaryKey(),
		programId: text("program_id").references(() => program.id, {
			onDelete: "cascade",
		}),
		termId: text("term_id").references(() => academicTerm.id, {
			onDelete: "cascade",
		}),
		ploId: text("plo_id").references(() => plo.id, { onDelete: "set null" }),
		summary: text("summary").notNull(), // model-generated summary
		recommendationText: text("recommendation_text").notNull(), // CQI suggestion
		sourceDataSnapshot: jsonb("source_data_snapshot")
			.notNull()
			.default(sql`'{}'::jsonb`), // inputs used, for traceability
		status: recommendationStatusEnum("status")
			.notNull()
			.default("pending_review"),
		reviewedByUserId: text("reviewed_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}), // AQAU/VPAA — mandatory human review before action
		reviewedAt: timestamp("reviewed_at"),
		generatedAt: timestamp("generated_at").notNull().defaultNow(),
	},
	(t) => [index("idx_recommendation_status").on(t.status)],
);

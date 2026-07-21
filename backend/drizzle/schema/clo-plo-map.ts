import { numeric, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { clo } from "./clo";
import { plo } from "./plo";

// Many-to-many CLO -> PLO with contribution weight (drives PLO rollup)
export const cloToPloMap = pgTable(
	"clo_to_plo_map",
	{
		id: text("id").primaryKey(),
		cloId: text("clo_id")
			.notNull()
			.references(() => clo.id, { onDelete: "cascade" }),
		ploId: text("plo_id")
			.notNull()
			.references(() => plo.id, { onDelete: "cascade" }),
		weight: numeric("weight", { precision: 4, scale: 3 })
			.notNull()
			.default("1.000"),
	},
	(t) => [uniqueIndex("uniq_clo_plo").on(t.cloId, t.ploId)],
);

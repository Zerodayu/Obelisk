import { pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { peo } from "./peo";
import { plo } from "./plo";

export const ploToPeoMap = pgTable(
	"plo_to_peo_map",
	{
		id: text("id").primaryKey(),
		ploId: text("plo_id")
			.notNull()
			.references(() => plo.id, { onDelete: "cascade" }),
		peoId: text("peo_id")
			.notNull()
			.references(() => peo.id, { onDelete: "cascade" }),
	},
	(t) => [uniqueIndex("uniq_plo_peo").on(t.ploId, t.peoId)],
);

import { t } from "elysia";

/**
 * Graduation-cluster archive — the read side of the archival pipeline.
 *
 * The cluster itself is a **read-only** compiled record: it groups every
 * student finishing their relationship with a program in a given term
 * (graduates, transferees-out, withdrawn). The write side (confirm → PEO
 * capture → compile → export → purge) is deliberately out of scope here —
 * see `service.ts`.
 */

/** `GET /archives` — list clusters, optionally filtered. */
export const ClusterListQuerySchema = t.Object({
	programId: t.Optional(
		t.String({ description: "Restrict to one program (403 if out of unit)" }),
	),
	status: t.Optional(
		t.Union([t.Literal("open"), t.Literal("compiling"), t.Literal("archived")]),
	),
});

/**
 * `POST /archives/:clusterId/confirm` — capture PEO attainment, after which
 * the cluster may be compiled. `peoAttainment` is the captured snapshot the
 * compile step writes into every entry.
 */
export const ClusterConfirmSchema = t.Object({
	peoAttainment: t.Record(t.String(), t.Unknown()),
});

export type ClusterListQuery = typeof ClusterListQuerySchema.static;
export type ClusterConfirm = typeof ClusterConfirmSchema.static;

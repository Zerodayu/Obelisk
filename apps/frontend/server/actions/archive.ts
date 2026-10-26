/**
 * Graduation-cluster server actions.
 *
 * `confirmClusterAction` is the AQAU/system_admin step that stamps the newest
 * PEO attainment snapshot onto an `open` cluster — the precondition a compile
 * checks. The backend enforces the role and unit scope; the action only
 * forwards the browser session.
 */

"use server";

import { ApiError } from "@/lib/api-client";
import { FEATURE_ACCESS } from "@/lib/role-access";
import { actionApi } from "@/server/api-client";
import { requireRole } from "@/server/auth";

export type ConfirmClusterResult =
	| { ok: true }
	| { ok: false; error: string; status?: number };

/** PEO attainment row shape from `GET /rollup/peo-attainment`. */
interface PeoAttainmentRow {
	peoCode: string;
	attainedPct: number;
}

export async function confirmClusterAction(
	clusterId: string,
): Promise<ConfirmClusterResult> {
	await requireRole(FEATURE_ACCESS.confirmClusterCompile);
	try {
		// NOTE: the confirm body is a loose `Record<string, unknown>` server-side;
		// pinning it to `{ [peoCode]: attainedPct }` keeps it consistent with the
		// rollup endpoint the numbers come from.
		const rows = await actionApi.get<PeoAttainmentRow[]>(
			"/rollup/peo-attainment",
		);
		const peoAttainment = Object.fromEntries(
			rows.map((row) => [row.peoCode, row.attainedPct]),
		);
		await actionApi.post<{ confirmed: true }>(
			`/archives/${clusterId}/confirm`,
			{ peoAttainment },
		);
		return { ok: true };
	} catch (err) {
		return {
			ok: false,
			error:
				err instanceof ApiError ? err.message : "Failed to confirm cluster.",
			status: err instanceof ApiError ? err.status : undefined,
		};
	}
}

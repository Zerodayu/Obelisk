import { assertCanViewPlatformStats } from "@lib/role-access";
import { authPlugin } from "@v1/auth/controller";
import { Elysia } from "elysia";

import { exportStatsService } from "./service";

const SECURITY = {
	security: [{ bearerAuth: [] as string[], apiKeyCookie: [] as string[] }],
};

/** The authenticated caller's role (better-auth additional field). */
function callerRole(user: unknown): string {
	return (user as { role?: string } | undefined)?.role ?? "user";
}

export const reportsPlugin = new Elysia({
	prefix: "/reports",
	name: "reports",
	tags: ["Reports"],
})
	.use(authPlugin)
	.get(
		"/exports",
		async ({ user }) => {
			// NOTE: platform-wide by design (every export ever made), so it is
			// admin-gated, not unit-scoped — `ReportExport` carries the exporting
			// user, which is not the unit that produced the report.
			assertCanViewPlatformStats(callerRole(user));
			return exportStatsService.formatCounts();
		},
		{
			auth: true,
			detail: {
				summary: "Count report exports by format",
				description:
					"Platform-wide headcount of ReportExport rows per format (pdf/excel/word). Deliberately not unit-scoped — the row records who exported, not which unit produced the report — so the route is gated to system admin instead.",
				...SECURITY,
				responses: {
					200: { description: "Format -> export count" },
					401: { description: "Unauthorized" },
					403: { description: "Caller may not read platform statistics" },
				},
			},
		},
	);

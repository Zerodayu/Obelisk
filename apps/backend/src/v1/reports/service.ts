import { prisma } from "@lib/prisma";

/**
 * Platform-wide statistics over `ReportExport`.
 *
 * NOTE: kept out of a feature module's service because it reads a single
 * table with no submission/form lifecycle of its own, and is admin-gated
 * (`viewPlatformStats`) rather than unit-scoped.
 */

/** Every format value, so a format with no exports still reports a zero row. */
const EXPORT_FORMATS = ["pdf", "excel", "word"] as const;

export const exportStatsService = {
	/**
	 * `GET /reports/exports` — how many exports each format accounts for.
	 *
	 * Every format is emitted even at zero, so the chart's axis is stable
	 * rather than growing as formats get used.
	 */
	async formatCounts() {
		const rows = await prisma.reportExport.groupBy({
			by: ["format"],
			_count: { _all: true },
		});
		const counts = new Map<string, number>(
			rows.map((row) => [row.format, row._count._all]),
		);
		return EXPORT_FORMATS.map((format) => ({
			format,
			count: counts.get(format) ?? 0,
		}));
	},
};

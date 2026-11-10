import { CqiInstitutionalReportView } from "@/components/reports/cqi-institutional-report";
import { listTerms } from "@/server/actions/academic";
import { requireRole } from "@/server/auth";

/** Institution-wide CQI report — VPAA/AQAU read, VPAA/admin generate. */
export default async function CqiInstitutionalReportPage() {
	await requireRole(["aqau", "vpaa", "system_admin"]);
	const terms = await listTerms();

	return (
		<CqiInstitutionalReportView
			terms={
				terms.ok
					? terms.data.map((term) => ({
							id: term.id,
							label: `${term.schoolYear} — ${term.semester}`,
						}))
					: []
			}
		/>
	);
}

import { CqiInstitutionalReportView } from "@/components/reports/cqi-institutional-report";
import { featureRoles } from "@/lib/role-access";
import { requireRole } from "@/server/auth";

/** Institution-wide CQI report — AQAU/VPAA/program chairs read, VPAA/admin generate. */
export default async function CqiInstitutionalReportPage() {
	await requireRole(featureRoles("viewCqiInstitutionalReport"));

	return <CqiInstitutionalReportView />;
}

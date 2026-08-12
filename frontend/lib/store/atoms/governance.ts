/**
 * Governance dataset atoms (institutional oversight / QA charts).
 *
 * Most are mock-seeded until their endpoints land. `formStatusCountsAtom`
 * derives from the real `GET /forms` fetch (see `atoms/forms.ts`), so the
 * submission-status donut reflects live database counts.
 */

import {
  type ApprovalFlowDatum,
  type AtRiskDatum,
  type AuditActivityDatum,
  type ClusterCompositionDatum,
  type ClusterStatusDatum,
  type ExportFormatDatum,
  type FormTypeStageDatum,
  MOCK_APPROVAL_FLOW,
  MOCK_AT_RISK,
  MOCK_AUDIT_ACTIVITY,
  MOCK_CLUSTER_COMPOSITION,
  MOCK_CLUSTER_STATUSES,
  MOCK_EXPORT_FORMATS,
  MOCK_FORM_TYPE_STAGES,
  MOCK_RECOMMENDATIONS,
  MOCK_USER_ROLES,
  type RecommendationStatusDatum,
  type UserRoleDatum,
} from "@/components/charts/obe-sample-data";
import { atomWithMockData } from "@/lib/store/async-atom";
import { formStatusCountsAtom } from "@/lib/store/atoms/forms";

export { formStatusCountsAtom };

/** At-risk watchlist grouped by `AtRiskFlag.reason`. */
export const { dataAtom: atRiskDataAtom, refreshAtom: refreshAtRiskAtom } =
  atomWithMockData<AtRiskDatum[]>(MOCK_AT_RISK);

/** Approval-chain decisions per role (`ApprovalStep`). */
export const {
  dataAtom: approvalFlowDataAtom,
  refreshAtom: refreshApprovalFlowAtom,
} = atomWithMockData<ApprovalFlowDatum[]>(MOCK_APPROVAL_FLOW);

/** Audit-trial activity grouped by module (`AuditLog`). */
export const {
  dataAtom: auditActivityDataAtom,
  refreshAtom: refreshAuditActivityAtom,
} = atomWithMockData<AuditActivityDatum[]>(MOCK_AUDIT_ACTIVITY);

/** AI recommendation review statuses (`AiRecommendation.status`). */
export const {
  dataAtom: recommendationsDataAtom,
  refreshAtom: refreshRecommendationsAtom,
} = atomWithMockData<RecommendationStatusDatum[]>(MOCK_RECOMMENDATIONS);

/** Graduation-cluster composition by archived student status. */
export const {
  dataAtom: clusterCompositionDataAtom,
  refreshAtom: refreshClusterCompositionAtom,
} = atomWithMockData<ClusterCompositionDatum[]>(MOCK_CLUSTER_COMPOSITION);

/** Report exports by format (`ReportExport.format`). */
export const {
  dataAtom: exportFormatsDataAtom,
  refreshAtom: refreshExportFormatsAtom,
} = atomWithMockData<ExportFormatDatum[]>(MOCK_EXPORT_FORMATS);

/** Form-type catalog by PDCA stage (`FormType.pdcaStage`). */
export const {
  dataAtom: formTypeStagesDataAtom,
  refreshAtom: refreshFormTypeStagesAtom,
} = atomWithMockData<FormTypeStageDatum[]>(MOCK_FORM_TYPE_STAGES);

/** Platform users by role (`user.role`). */
export const {
  dataAtom: userRolesDataAtom,
  refreshAtom: refreshUserRolesAtom,
} = atomWithMockData<UserRoleDatum[]>(MOCK_USER_ROLES);

/** Graduation-cluster lifecycle statuses (`GraduationCluster.status`). */
export const {
  dataAtom: clusterStatusesDataAtom,
  refreshAtom: refreshClusterStatusesAtom,
} = atomWithMockData<ClusterStatusDatum[]>(MOCK_CLUSTER_STATUSES);

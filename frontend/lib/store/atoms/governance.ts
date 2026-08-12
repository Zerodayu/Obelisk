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
  MOCK_APPROVAL_FLOW,
  MOCK_AT_RISK,
  MOCK_AUDIT_ACTIVITY,
  MOCK_CLUSTER_COMPOSITION,
  MOCK_RECOMMENDATIONS,
  type RecommendationStatusDatum,
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

/**
 * Governance dataset atoms (institutional oversight / QA charts).
 *
 * `approvalFlowDataAtom` and `formStatusCountsAtom` are derived from the real
 * `GET /forms` fetch (see `atoms/forms.ts`), so they reflect live database
 * counts. The remaining charts have no backend endpoint yet (audit log,
 * graduation clusters, report exports, platform-wide user/role counts, the
 * at-risk flag reasons, and the AI recommendation list), so they are seeded
 * with `[]` and render an empty state instead of fabricated numbers.
 */

import { atom } from "jotai";

import type {
  ApprovalFlowDatum,
  AtRiskDatum,
  AuditActivityDatum,
  ClusterCompositionDatum,
  ClusterStatusDatum,
  ExportFormatDatum,
  FormTypeStageDatum,
  RecommendationStatusDatum,
  UserRoleDatum,
} from "@/components/charts/obe-sample-data";
import { atomWithMockData } from "@/lib/store/async-atom";
import {
  formStatusCountsAtom,
  formSubmissionsDataAtom,
  refreshFormSubmissionsAtom,
} from "@/lib/store/atoms/forms";

export { formStatusCountsAtom };

/**
 * Approval-chain decisions per role, aggregated from every submission's
 * `approvalSteps`. Shares the `GET /forms` fetch with the status donut.
 */
export const approvalFlowDataAtom = atom<ApprovalFlowDatum[]>((get) => {
  const counts = new Map<
    string,
    { pending: number; approved: number; returned: number }
  >();
  for (const submission of get(formSubmissionsDataAtom)) {
    for (const step of submission.approvalSteps ?? []) {
      const bucket = counts.get(step.approverRole) ?? {
        pending: 0,
        approved: 0,
        returned: 0,
      };
      bucket[step.decision] += 1;
      counts.set(step.approverRole, bucket);
    }
  }
  return [...counts].map(([approverRole, bucket]) => ({
    approverRole,
    ...bucket,
  }));
});

/** Refreshes the underlying `GET /forms` fetch that feeds the derivation. */
export const refreshApprovalFlowAtom = refreshFormSubmissionsAtom;

// TODO(at-risk): `AtRiskFlag.reason` is written by the ingest pipeline but no
// route exposes it yet — the `/ingest/attainments` rows carry the boolean only.
/** At-risk watchlist grouped by `AtRiskFlag.reason`. */
export const { dataAtom: atRiskDataAtom, refreshAtom: refreshAtRiskAtom } =
  atomWithMockData<AtRiskDatum[]>([]);

// TODO(audit): `AuditLog` is written across the backend but never read by a route.
/** Audit-trial activity grouped by module (`AuditLog`). */
export const {
  dataAtom: auditActivityDataAtom,
  refreshAtom: refreshAuditActivityAtom,
} = atomWithMockData<AuditActivityDatum[]>([]);

// TODO(ai-status): `GET /ai/recommendation/latest` returns a single record, not
// a status distribution — a list route is needed for this donut.
/** AI recommendation review statuses (`AiRecommendation.status`). */
export const {
  dataAtom: recommendationsDataAtom,
  refreshAtom: refreshRecommendationsAtom,
} = atomWithMockData<RecommendationStatusDatum[]>([]);

// TODO(archives): the graduation-cluster archival pipeline has no routes yet.
/** Graduation-cluster composition by archived student status. */
export const {
  dataAtom: clusterCompositionDataAtom,
  refreshAtom: refreshClusterCompositionAtom,
} = atomWithMockData<ClusterCompositionDatum[]>([]);

// TODO(exports): `ReportExport` is never queried by a route.
/** Report exports by format (`ReportExport.format`). */
export const {
  dataAtom: exportFormatsDataAtom,
  refreshAtom: refreshExportFormatsAtom,
} = atomWithMockData<ExportFormatDatum[]>([]);

// TODO(form-catalog): no `/forms/types` route — submissions only reveal the
// types that have been used, which is not the catalog distribution.
/** Form-type catalog by PDCA stage (`FormType.pdcaStage`). */
export const {
  dataAtom: formTypeStagesDataAtom,
  refreshAtom: refreshFormTypeStagesAtom,
} = atomWithMockData<FormTypeStageDatum[]>([]);

// TODO(user-roles): `GET /auth/role-requests` is admin-only and filtered by
// request status, so it cannot seed a platform-wide role distribution.
/** Platform users by role (`user.role`). */
export const {
  dataAtom: userRolesDataAtom,
  refreshAtom: refreshUserRolesAtom,
} = atomWithMockData<UserRoleDatum[]>([]);

/** Graduation-cluster lifecycle statuses (`GraduationCluster.status`). */
export const {
  dataAtom: clusterStatusesDataAtom,
  refreshAtom: refreshClusterStatusesAtom,
} = atomWithMockData<ClusterStatusDatum[]>([]);

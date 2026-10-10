/**
 * Class-record ingest atoms — shared upload/processing state.
 *
 * The polling loop itself stays in `ClassRecordUpload` (component-managed
 * interval with cleanup), but all domain state lives here so other parts of
 * the app (charts, dashboards) can react to a completed ingest — e.g. trigger
 * a refresh of the attainment atoms once the rollup endpoints exist.
 */

import { atom } from "jotai";

import type {
  ComputationRunDatum,
  UploadStatusDatum,
} from "@/components/charts/obe-sample-data";
import { api } from "@/lib/api-client";
import { atomWithAsyncData, atomWithMockData } from "@/lib/store/async-atom";

// NOTE: the target class section moved to the global academic context
// (`atoms/academic.ts` — localStorage-backed, shared with the sidebar
// selector); re-exported here so ingest call-sites keep one import path.
export { selectedClassSectionIdAtom } from "@/lib/store/atoms/academic";

export type IngestStatus =
  | "idle"
  | "uploading"
  | "processing"
  // ETL finished, nothing persisted yet — the user picks Save or Re-upload.
  | "review"
  // The save call is writing the DB rows.
  | "saving"
  | "completed"
  | "failed";

export interface SectionComparisonResult {
  status: "match" | "mismatch" | "unverified";
  mismatches: string[];
  warnings: string[];
}

/** Mirrors the backend persistence summary returned on job completion. */
export interface PersistenceSummary {
  computationRunId: string;
  studentsProcessed: number;
  studentsCreated: number;
  cloAttainmentsCreated: number;
  atRiskFlagsCreated: number;
  cloMatchFailures: {
    cloCode: string;
    studentName: string;
    reason: string;
  }[];
  verification?: SectionComparisonResult;
}

/**
 * Mirrors the backend `UploadPreview` on a `ready` job status — the read-only
 * summary shown before the user saves. Nothing is persisted at this point.
 */
export interface UploadPreview {
  verification: SectionComparisonResult;
  students: number;
  rows: number;
  atRisk: number;
  /** CLO codes the course does not define — rows a save skips. */
  unmatchedClos: { cloCode: string; rows: number }[];
  setup: {
    course_code?: string | null;
    course_title?: string | null;
    term?: string | null;
    faculty_name?: string | null;
    program?: string | null;
  } | null;
}

/** Mirrors the backend `UploadRecord` JSON contract from `GET /ingest/history`. */
export interface UploadHistoryRecord {
  id: string;
  userId: string;
  classSectionId: string;
  filename: string;
  status: "queued" | "completed" | "failed" | "discarded";
  error: string | null;
  etlJobId: string | null;
  computationRunId: string | null;
  summary: PersistenceSummary | null;
  createdAt: string;
  updatedAt: string;
  classSection: {
    sectionCode: string;
    course: { code: string; title: string };
    term: { schoolYear: string; semester: string };
  } | null;
}

export const ingestStatusAtom = atom<IngestStatus>("idle");

export const ingestJobIdAtom = atom<string | null>(null);

export const persistenceSummaryAtom = atom<PersistenceSummary | null>(null);

export const ingestErrorAtom = atom<string | null>(null);

/** Pre-save summary of a `ready` job — null until the ETL finishes. */
export const ingestPreviewAtom = atom<UploadPreview | null>(null);

/** Reset transient state and mark the upload phase. */
export const startUploadAtom = atom(null, (_get, set) => {
  set(ingestStatusAtom, "uploading");
  set(ingestJobIdAtom, null);
  set(persistenceSummaryAtom, null);
  set(ingestPreviewAtom, null);
  set(ingestErrorAtom, null);
});

/** Persist the ETL job id and move to the polling phase. */
export const markProcessingAtom = atom(null, (_get, set, jobId: string) => {
  set(ingestJobIdAtom, jobId);
  set(ingestStatusAtom, "processing");
});

/** ETL finished without writing — hold the preview for the Save/Re-upload step. */
export const markReviewAtom = atom(
  null,
  (_get, set, preview: UploadPreview) => {
    set(ingestStatusAtom, "review");
    set(ingestPreviewAtom, preview);
  },
);

/** The save call is in flight — the reviewed job is being persisted. */
export const markSavingAtom = atom(null, (_get, set) => {
  set(ingestStatusAtom, "saving");
});

/** Record a successful (or empty) persistence result. */
export const completeIngestAtom = atom(
  null,
  (_get, set, summary: PersistenceSummary | null) => {
    set(ingestStatusAtom, "completed");
    set(persistenceSummaryAtom, summary);
  },
);

/** Record a processing failure. */
export const failIngestAtom = atom(null, (_get, set, error: string) => {
  set(ingestStatusAtom, "failed");
  set(ingestErrorAtom, error);
});

/** Back to a clean slate (used for retries / re-uploads). */
export const resetIngestAtom = atom(null, (_get, set) => {
  set(ingestJobIdAtom, null);
  set(ingestStatusAtom, "idle");
  set(persistenceSummaryAtom, null);
  set(ingestPreviewAtom, null);
  set(ingestErrorAtom, null);
});

/**
 * DB-backed upload history (`GET /ingest/history`): every upload attempt by the
 * signed-in user across devices, newest first, including failed ones. Records
 * are created server-side on each upload and updated on ETL completion.
 */
export const {
  dataAtom: uploadsHistoryDataAtom,
  stateAtom: uploadsHistoryStateAtom,
  refreshAtom: refreshUploadHistoryAtom,
} = atomWithAsyncData<UploadHistoryRecord[]>([], () =>
  api.get<UploadHistoryRecord[]>("/ingest/history"),
);

/**
 * Class-record upload status distribution, aggregated from the same
 * `GET /ingest/history` fetch as the history table. The route is role-gated to
 * capture roles (faculty / program_chair / system_admin) — other roles get a
 * 403, which leaves this atom on its empty seed and the donut on its empty
 * state.
 */
export const uploadStatusesDataAtom = atom<UploadStatusDatum[]>((get) => {
  const history = get(uploadsHistoryDataAtom);
  const counts = new Map<UploadStatusDatum["status"], number>();
  for (const record of history) {
    counts.set(record.status, (counts.get(record.status) ?? 0) + 1);
  }
  return [...counts]
    .filter(([, count]) => count > 0)
    .map(([status, count]) => ({ status, count }));
});

/** Refreshes the underlying `GET /ingest/history` fetch. */
export const refreshUploadStatusesAtom = refreshUploadHistoryAtom;

// TODO(computation-runs): `ComputationRun` is only read by internal services —
// no route lists runs per term yet.
/** 70/30 computation-run volume per term (`ComputationRun`). */
export const {
  dataAtom: computationRunsDataAtom,
  refreshAtom: refreshComputationRunsAtom,
} = atomWithMockData<ComputationRunDatum[]>([]);

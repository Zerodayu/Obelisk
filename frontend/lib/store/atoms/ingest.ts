/**
 * Class-record ingest atoms — shared upload/processing state.
 *
 * The polling loop itself stays in `ClassRecordUpload` (component-managed
 * interval with cleanup), but all domain state lives here so other parts of
 * the app (charts, dashboards) can react to a completed ingest — e.g. trigger
 * a refresh of the attainment atoms once the rollup endpoints exist.
 */

import { atom } from "jotai";

import { api } from "@/lib/api-client";
import { atomWithAsyncData } from "@/lib/store/async-atom";

export type IngestStatus =
  | "idle"
  | "uploading"
  | "processing"
  | "completed"
  | "failed";

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
}

/** Mirrors the backend `UploadRecord` JSON contract from `GET /ingest/history`. */
export interface UploadHistoryRecord {
  id: string;
  userId: string;
  classSectionId: string;
  filename: string;
  status: "queued" | "completed" | "failed";
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

/** Reset transient state and mark the upload phase. */
export const startUploadAtom = atom(null, (_get, set) => {
  set(ingestStatusAtom, "uploading");
  set(ingestJobIdAtom, null);
  set(persistenceSummaryAtom, null);
  set(ingestErrorAtom, null);
});

/** Persist the ETL job id and move to the polling phase. */
export const markProcessingAtom = atom(null, (_get, set, jobId: string) => {
  set(ingestJobIdAtom, jobId);
  set(ingestStatusAtom, "processing");
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

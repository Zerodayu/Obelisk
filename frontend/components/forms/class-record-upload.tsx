"use client";

import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Progress, ProgressValue } from "@/components/ui/progress";
import { toast, toastError } from "@/components/ui/toast";
import {
  FileUpload,
  type FileUploadItem,
} from "@/components/upload/file-upload";
import { api, isApiError } from "@/lib/api-client";
import {
  completeIngestAtom,
  failIngestAtom,
  ingestJobIdAtom,
  ingestStatusAtom,
  markProcessingAtom,
  refreshUploadHistoryAtom,
  startUploadAtom,
} from "@/lib/store/atoms/ingest";

const ALLOWED_EXTENSIONS = [".csv", ".tsv", ".xls", ".xlsx"];
const ALLOWED_MIME = [
  "text/csv",
  "text/tab-separated-values",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

const TEST_CLASS_SECTION_ID = "clv92a9f1000108l3d26b52b3";
const POLL_INTERVAL_MS = 2000;

interface StatusResponse {
  status: "queued" | "running" | "completed" | "failed";
  etl?: unknown;
  persistence?: {
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
  };
  error?: { message?: string };
}

export function ClassRecordUpload() {
  const [items, setItems] = useState<FileUploadItem[]>([]);
  const [isMounted, setIsMounted] = useState(false);

  const status = useAtomValue(ingestStatusAtom);
  const jobId = useAtomValue(ingestJobIdAtom);

  const setStartUpload = useSetAtom(startUploadAtom);
  const setMarkProcessing = useSetAtom(markProcessingAtom);
  const setCompleteIngest = useSetAtom(completeIngestAtom);
  const setFailIngest = useSetAtom(failIngestAtom);
  const setRefreshHistory = useSetAtom(refreshUploadHistoryAtom);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const file = items[0]?.file;

  const patchItem = useCallback((patch: Partial<FileUploadItem>) => {
    setItems((prev) =>
      prev.length === 0 ? prev : [{ ...prev[0], ...patch }, ...prev.slice(1)],
    );
  }, []);

  // Poll the ETL job while it is `processing`; write results into the ingest
  // atoms so any consumer (charts, dashboards) can react to completion.
  useEffect(() => {
    if (!jobId || status !== "processing") return;

    let disposed = false;
    const interval = setInterval(async () => {
      try {
        const res = await api.get<StatusResponse>(
          `/ingest/upload/${jobId}/status`,
          { query: { classSectionId: TEST_CLASS_SECTION_ID } },
        );

        if (disposed) return;
        if (res.status === "completed") {
          const summary = res.persistence;
          patchItem({ status: "success", progress: 100 });
          setCompleteIngest(summary ?? null);
          setRefreshHistory();
          if (summary) {
            toast.success({
              id: "ingest:complete",
              title: "Processing Complete",
              description: [
                `${summary.studentsProcessed} students processed`,
                `${summary.cloAttainmentsCreated} CLO records recorded`,
                `${summary.atRiskFlagsCreated} at-risk students flagged`,
              ].join(" · "),
            });
            if (summary.cloMatchFailures.length > 0) {
              toast.warning({
                id: "ingest:clo-match-warning",
                title: "CLO Matching Failures",
                description: `${summary.cloMatchFailures.length} attainment record${summary.cloMatchFailures.length === 1 ? "" : "s"} skipped (unmatched CLO codes).`,
              });
            }
          }
        } else if (res.status === "failed") {
          const message = res.error?.message || "Processing failed.";
          patchItem({ status: "error", error: message });
          setFailIngest(message);
          setRefreshHistory();
          toastError({
            scope: "ingest",
            title: "Upload Failed",
            description: message,
          });
        }
        // If 'queued' or 'running', keep polling.
      } catch (error) {
        if (disposed) return;
        const message = isApiError(error)
          ? `Polling failed (status ${error.status}): ${
              error.payload?.message || error.message
            }`
          : "An unexpected error occurred while polling.";
        patchItem({ status: "error", error: message });
        setFailIngest(message);
        setRefreshHistory();
        toastError({
          status: isApiError(error) ? error.status : undefined,
          scope: "ingest",
          title: "Upload Failed",
          description: message,
        });
      }
    }, POLL_INTERVAL_MS);

    return () => {
      disposed = true;
      clearInterval(interval);
    };
  }, [
    jobId,
    status,
    patchItem,
    setCompleteIngest,
    setFailIngest,
    setRefreshHistory,
  ]);

  async function handleUpload() {
    if (!file) return;

    setStartUpload();
    patchItem({ status: "uploading", error: undefined });

    try {
      // 1. Start the upload and get the job ID.
      const { jobId: nextJobId } = await api.upload<{ jobId: string }>(
        "/ingest/upload",
        file,
        { classSectionId: TEST_CLASS_SECTION_ID },
      );
      // 2. Move to the polling phase; the effect above takes over.
      setMarkProcessing(nextJobId);
    } catch (error) {
      const message = isApiError(error)
        ? `Upload failed (status ${error.status}): ${
            error.payload?.message || error.message
          }`
        : "An unexpected error occurred during upload.";
      patchItem({ status: "error", error: message });
      setFailIngest(message);
      toastError({
        status: isApiError(error) ? error.status : undefined,
        scope: "ingest",
        title: "Upload Failed",
        description: message,
      });
      console.error(error);
    }
  }

  function isValidFile(file: File) {
    const ext = `.${file.name.split(".").pop()?.toLowerCase() ?? ""}`;
    return ALLOWED_EXTENSIONS.includes(ext) || ALLOWED_MIME.includes(file.type);
  }

  const isWorking = status === "uploading" || status === "processing";
  const isUploading = status === "uploading";
  const progressLabel = isUploading
    ? "Uploading class record…"
    : "Processing class record…";
  const buttonText =
    status === "uploading"
      ? "Uploading..."
      : status === "processing"
        ? "Processing..."
        : "Upload & Process";

  return (
    <section className="space-y-4">
      <FileUpload
        accept=".csv,.tsv,.xls,.xlsx"
        validateFile={isValidFile}
        value={items}
        variant="default"
        onValueChange={setItems}
        maxFiles={1}
        title="Upload class record"
        description="CSV, Excel, or TSV class record sheets"
        disabled={isWorking}
        onRetry={handleUpload}
      />
      {isMounted && (
        <div className="flex w-full justify-center items-center gap-4">
          {!isWorking && (
            <Button onClick={handleUpload} disabled={!file} className="w-40">
              {buttonText}
            </Button>
          )}
          {isWorking && (
            <Field className="w-full max-w-xs">
              <Progress
                indeterminate
                className="flex justify-center items-center"
              >
                <FieldLabel>{progressLabel}</FieldLabel>

                <ProgressValue />
              </Progress>
            </Field>
          )}
        </div>
      )}
    </section>
  );
}

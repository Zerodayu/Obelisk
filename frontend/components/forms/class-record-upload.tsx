"use client";

import { useAtomValue, useSetAtom } from "jotai";
import { AlertTriangle, Info, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  FileUpload,
  type FileUploadItem,
} from "@/components/upload/file-upload";
import { api, isApiError } from "@/lib/api-client";
import {
  completeIngestAtom,
  failIngestAtom,
  ingestErrorAtom,
  ingestJobIdAtom,
  ingestStatusAtom,
  markProcessingAtom,
  persistenceSummaryAtom,
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
  const uploadResult = useAtomValue(persistenceSummaryAtom);
  const uploadError = useAtomValue(ingestErrorAtom);

  const setStartUpload = useSetAtom(startUploadAtom);
  const setMarkProcessing = useSetAtom(markProcessingAtom);
  const setCompleteIngest = useSetAtom(completeIngestAtom);
  const setFailIngest = useSetAtom(failIngestAtom);

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
          patchItem({ status: "success", progress: 100 });
          setCompleteIngest(res.persistence ?? null);
        } else if (res.status === "failed") {
          const message = res.error?.message || "Processing failed.";
          patchItem({ status: "error", error: message });
          setFailIngest(message);
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
      }
    }, POLL_INTERVAL_MS);

    return () => {
      disposed = true;
      clearInterval(interval);
    };
  }, [jobId, status, patchItem, setCompleteIngest, setFailIngest]);

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
      console.error(error);
    }
  }

  function isValidFile(file: File) {
    const ext = `.${file.name.split(".").pop()?.toLowerCase() ?? ""}`;
    return ALLOWED_EXTENSIONS.includes(ext) || ALLOWED_MIME.includes(file.type);
  }

  const summary = uploadResult;
  const isWorking = status === "uploading" || status === "processing";
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
        <div className="flex items-center gap-4">
          <Button
            onClick={handleUpload}
            disabled={!file || isWorking}
            className="w-40"
          >
            {isWorking ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            {buttonText}
          </Button>
          <p className="text-xs text-muted-foreground">
            Uploads to class section: {TEST_CLASS_SECTION_ID}
          </p>
        </div>
      )}

      {uploadError && (
        <div className="p-4 rounded-md bg-destructive/10 text-destructive flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 mt-0.5" />
          <div>
            <p className="font-semibold">Upload Failed</p>
            <p className="text-sm">{uploadError}</p>
          </div>
        </div>
      )}

      {summary && (
        <div className="p-4 rounded-md bg-muted/50 space-y-4">
          <div>
            <h3 className="font-semibold mb-2">Processing Complete</h3>
            <ul className="text-sm space-y-1 list-disc list-inside">
              <li>Students processed: {summary.studentsProcessed}</li>
              <li>New students created: {summary.studentsCreated}</li>
              <li>CLO attainments recorded: {summary.cloAttainmentsCreated}</li>
              <li>Students flagged at-risk: {summary.atRiskFlagsCreated}</li>
            </ul>
          </div>

          {summary.cloMatchFailures.length > 0 && (
            <div className="p-4 rounded-md bg-amber-400/20 text-amber-900 dark:text-amber-200 dark:bg-amber-900/20">
              <div className="flex items-start gap-3">
                <Info className="h-5 w-5 mt-0.5" />
                <div>
                  <p className="font-semibold">CLO Matching Failures</p>
                  <p className="text-sm mb-2">
                    The following attainment records were skipped because the
                    CLO code in the file does not exist for this course.
                  </p>
                  <ul className="text-xs space-y-1 list-disc list-inside">
                    {summary.cloMatchFailures.map((failure) => (
                      <li key={`${failure.studentName}:${failure.cloCode}`}>
                        Student "{failure.studentName}" — CLO "{failure.cloCode}
                        "
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

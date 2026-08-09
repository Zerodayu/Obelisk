"use client";

import { useState, useEffect, useRef } from "react";
import {
  FileUpload,
  type FileUploadItem,
} from "@/components/upload/file-upload";
import { api, isApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Loader2, AlertTriangle, Info } from "lucide-react";

const ALLOWED_EXTENSIONS = [".csv", ".tsv", ".xls", ".xlsx"];
const ALLOWED_MIME = [
  "text/csv",
  "text/tab-separated-values",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

const TEST_CLASS_SECTION_ID = "clv92a9f1000108l3d26b52b3";
const POLL_INTERVAL_MS = 2000;

interface PersistenceSummary {
  computationRunId: string;
  studentsProcessed: number;
  studentsCreated: number;
  cloAttainmentsCreated: number;
  atRiskFlagsCreated: number;
  cloMatchFailures: { cloCode: string; studentName: string; reason: string }[];
}

interface StatusResponse {
  status: "queued" | "running" | "completed" | "failed";
  etl?: unknown;
  persistence?: PersistenceSummary;
  error?: { message?: string };
}

export function ClassRecordUpload() {
  const [items, setItems] = useState<FileUploadItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadResult, setUploadResult] = useState<PersistenceSummary | null>(
    null,
  );
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const pollingInterval = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setIsMounted(true);
    // Cleanup interval on unmount
    return () => {
      if (pollingInterval.current) {
        clearInterval(pollingInterval.current);
      }
    };
  }, []);

  const file = items[0]?.file;

  const pollJobStatus = (jobId: string) => {
    pollingInterval.current = setInterval(async () => {
      try {
        const res = await api.get<StatusResponse>(
          `/ingest/upload/${jobId}/status`,
          { query: { classSectionId: TEST_CLASS_SECTION_ID } },
        );

        if (res.status === "completed") {
          clearInterval(pollingInterval.current!);
          setIsProcessing(false);
          setUploadResult(res.persistence ?? null);
        } else if (res.status === "failed") {
          clearInterval(pollingInterval.current!);
          setIsProcessing(false);
          setUploadError(res.error?.message || "Processing failed.");
        }
        // If 'running' or 'queued', do nothing and let the polling continue.
      } catch (error) {
        clearInterval(pollingInterval.current!);
        setIsProcessing(false);
        if (isApiError(error)) {
          setUploadError(
            `Polling failed (status ${error.status}): ${
              error.payload?.message || error.message
            }`,
          );
        } else {
          setUploadError("An unexpected error occurred while polling.");
        }
      }
    }, POLL_INTERVAL_MS);
  };

  async function handleUpload() {
    if (!file) return;

    setIsUploading(true);
    setUploadResult(null);
    setUploadError(null);

    try {
      // 1. Start the upload and get the job ID.
      const { jobId } = await api.upload<{ jobId: string }>(
        "/ingest/upload",
        file,
        {
          classSectionId: TEST_CLASS_SECTION_ID,
        },
      );
      // 2. Start polling for the job status.
      setIsUploading(false);
      setIsProcessing(true);
      pollJobStatus(jobId);
    } catch (error) {
      setIsUploading(false);
      if (isApiError(error)) {
        setUploadError(
          `Upload failed (status ${error.status}): ${
            error.payload?.message || error.message
          }`,
        );
      } else {
        setUploadError("An unexpected error occurred during upload.");
      }
      console.error(error);
    }
  }

  function isValidFile(file: File) {
    const ext = `.${file.name.split(".").pop()?.toLowerCase() ?? ""}`;
    return ALLOWED_EXTENSIONS.includes(ext) || ALLOWED_MIME.includes(file.type);
  }

  const summary = uploadResult;
  const isWorking = isUploading || isProcessing;
  const buttonText = isUploading
    ? "Uploading..."
    : isProcessing
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
              <li>
                CLO attainments recorded: {summary.cloAttainmentsCreated}
              </li>
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
                    The following attainment records were skipped because the CLO
                    code in the file does not exist for this course.
                  </p>
                  <ul className="text-xs space-y-1 list-disc list-inside">
                    {summary.cloMatchFailures.map((failure, i) => (
                      <li key={i}>
                        Student "{failure.studentName}" — CLO "
                        {failure.cloCode}"
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
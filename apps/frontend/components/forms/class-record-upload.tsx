"use client";

import { useAtomValue, useSetAtom } from "jotai";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ClassSectionSelect } from "@/components/ui/class-section-select";
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
  resetIngestAtom,
  type SectionComparisonResult,
  startUploadAtom,
} from "@/lib/store/atoms/ingest";

const ALLOWED_EXTENSIONS = [".csv", ".tsv", ".xls", ".xlsx"];
const ALLOWED_MIME = [
  "text/csv",
  "text/tab-separated-values",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

const POLL_INTERVAL_MS = 2000;

interface IngestJobError {
  error_type: string;
  message: string;
  verification?: SectionComparisonResult;
}

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
    verification?: SectionComparisonResult;
  };
  verification?: SectionComparisonResult;
  error?: IngestJobError;
}

export function ClassRecordUpload() {
  const [items, setItems] = useState<FileUploadItem[]>([]);
  const [classSectionId, setClassSectionId] = useState<string>("");
  const [isMounted, setIsMounted] = useState(false);

  // Verification outcome state for persistent contextual notices
  const [verificationResult, setVerificationResult] =
    useState<SectionComparisonResult | null>(null);
  const [mismatchError, setMismatchError] = useState<{
    message: string;
    mismatches: string[];
  } | null>(null);

  const status = useAtomValue(ingestStatusAtom);
  const jobId = useAtomValue(ingestJobIdAtom);

  const setStartUpload = useSetAtom(startUploadAtom);
  const setMarkProcessing = useSetAtom(markProcessingAtom);
  const setCompleteIngest = useSetAtom(completeIngestAtom);
  const setFailIngest = useSetAtom(failIngestAtom);
  const setResetIngest = useSetAtom(resetIngestAtom);
  const setRefreshHistory = useSetAtom(refreshUploadHistoryAtom);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const file = items[0]?.file;
  const isWorking = status === "uploading" || status === "processing";

  const patchItem = useCallback((patch: Partial<FileUploadItem>) => {
    setItems((prev) =>
      prev.length === 0 ? prev : [{ ...prev[0], ...patch }, ...prev.slice(1)],
    );
  }, []);

  // When the user changes section, clear previous result states unless a job is active
  const handleSectionChange = useCallback(
    (newSectionId: string) => {
      if (isWorking) return;
      setClassSectionId(newSectionId);
      setVerificationResult(null);
      setMismatchError(null);
      setResetIngest();
      // Reset any item error state so it shows ready to upload
      if (items.length > 0 && items[0]?.status === "error") {
        patchItem({ status: "queued", error: undefined, progress: 0 });
      }
    },
    [isWorking, items, patchItem, setResetIngest],
  );

  // Resets the uploaded file so user can pick a different workbook
  const handleResetFile = useCallback(() => {
    setItems([]);
    setVerificationResult(null);
    setMismatchError(null);
    setResetIngest();
  }, [setResetIngest]);

  // Poll the ETL job while it is `processing`
  useEffect(() => {
    if (!jobId || status !== "processing" || !classSectionId) return;

    let disposed = false;
    const currentSectionId = classSectionId;

    const interval = setInterval(async () => {
      try {
        const res = await api.get<StatusResponse>(
          `/ingest/upload/${jobId}/status`,
          { query: { classSectionId: currentSectionId } },
        );

        if (disposed) return;

        if (res.status === "completed") {
          const summary = res.persistence;
          const verification =
            res.verification ?? summary?.verification ?? null;

          patchItem({ status: "success", progress: 100 });
          setCompleteIngest(summary ?? null);
          setRefreshHistory();
          setVerificationResult(verification);
          setMismatchError(null);

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

            if (verification?.status === "unverified") {
              toast.warning({
                id: "ingest:unverified-section-notice",
                title: "Section Unverified",
                description:
                  "Workbook section could not be read. Attainments were recorded under the selected section without verification.",
              });
            } else if (
              verification?.warnings &&
              verification.warnings.length > 0
            ) {
              toast.warning({
                id: "ingest:verification-warnings",
                title: "Workbook Warnings",
                description: verification.warnings.join(" · "),
              });
            }
          }
        } else if (res.status === "failed") {
          const isMismatch = res.error?.error_type === "SectionMismatchError";
          const message = res.error?.message || "Processing failed.";

          patchItem({ status: "error", error: message });
          setFailIngest(message);
          setRefreshHistory();

          if (isMismatch) {
            const mismatches = res.error?.verification?.mismatches ?? [message];
            setMismatchError({ message, mismatches });
            toastError({
              scope: "ingest:section-mismatch",
              title: "Section Mismatch",
              description: message,
            });
          } else {
            setMismatchError(null);
            toastError({
              scope: "ingest",
              title: "Upload Failed",
              description: message,
            });
          }
        }
        // If 'queued' or 'running', keep polling.
      } catch (error) {
        if (disposed) return;
        let message = "An unexpected error occurred while polling.";
        let errStatus: number | undefined;

        if (isApiError(error)) {
          errStatus = error.status;
          if (error.status === 400) {
            message =
              error.payload?.error ||
              error.payload?.message ||
              "Class section does not match the section bound to this upload job.";
          } else if (error.status === 404) {
            message =
              error.payload?.error ||
              error.payload?.message ||
              "Selected class section was not found.";
          } else {
            message = `Polling failed (status ${error.status}): ${
              error.payload?.error || error.payload?.message || error.message
            }`;
          }
        }

        patchItem({ status: "error", error: message });
        setFailIngest(message);
        setRefreshHistory();
        toastError({
          status: errStatus,
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
    classSectionId,
    patchItem,
    setCompleteIngest,
    setFailIngest,
    setRefreshHistory,
  ]);

  async function handleUpload() {
    if (!file || !classSectionId.trim()) return;

    setStartUpload();
    setVerificationResult(null);
    setMismatchError(null);
    patchItem({ status: "uploading", error: undefined });

    try {
      const { jobId: nextJobId } = await api.upload<{ jobId: string }>(
        "/ingest/upload",
        file,
        { classSectionId: classSectionId.trim() },
      );
      // Hand off to the polling effect above.
      setMarkProcessing(nextJobId);
    } catch (error) {
      let message = "An unexpected error occurred during upload.";
      let errStatus: number | undefined;

      if (isApiError(error)) {
        errStatus = error.status;
        if (error.status === 400) {
          message =
            error.payload?.error ||
            error.payload?.message ||
            "Invalid upload parameters.";
        } else if (error.status === 404) {
          message =
            error.payload?.error ||
            error.payload?.message ||
            "Selected class section was not found. Please verify the section exists.";
        } else {
          message = `Upload failed (status ${error.status}): ${
            error.payload?.error || error.payload?.message || error.message
          }`;
        }
      }

      patchItem({ status: "error", error: message });
      setFailIngest(message);
      toastError({
        status: errStatus,
        scope: "ingest",
        title: "Upload Failed",
        description: message,
      });
      console.error(error);
    }
  }

  function isValidFile(uploadedFile: File) {
    const ext = `.${uploadedFile.name.split(".").pop()?.toLowerCase() ?? ""}`;
    return (
      ALLOWED_EXTENSIONS.includes(ext) ||
      ALLOWED_MIME.includes(uploadedFile.type)
    );
  }

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

  const isUploadDisabled = isWorking || !file || !classSectionId.trim();

  return (
    <section className="space-y-4">
      {/* Class Section Selection */}
      <Field className="w-full">
        <FieldLabel>Target Class Section</FieldLabel>
        <ClassSectionSelect
          value={classSectionId}
          onValueChange={handleSectionChange}
          disabled={isWorking}
          loadAll={true}
          placeholder="Select class section to bind upload"
        />
      </Field>

      {/* File Upload Zone */}
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
        onRemove={handleResetFile}
      />

      {/* Mismatch Alert Box */}
      {mismatchError && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive-foreground dark:bg-destructive/20">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="size-5 shrink-0 text-destructive mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold text-foreground">
                  Section Verification Mismatch
                </p>
                <p className="text-muted-foreground">{mismatchError.message}</p>
                {mismatchError.mismatches.length > 0 && (
                  <ul className="list-inside list-disc text-xs text-muted-foreground pt-1">
                    {mismatchError.mismatches.map((m, idx) => (
                      <li key={idx}>{m}</li>
                    ))}
                  </ul>
                )}
                <p className="text-xs text-muted-foreground pt-2">
                  <span className="font-medium text-foreground">Hint:</span>{" "}
                  Check that you selected the right section, or upload the
                  correct workbook.
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleResetFile}
              className="shrink-0 text-xs"
            >
              <X className="size-3.5 mr-1" />
              Reset file
            </Button>
          </div>
        </div>
      )}

      {/* Unverified Warning Notice */}
      {verificationResult?.status === "unverified" && (
        <div className="rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm dark:bg-warning/20">
          <div className="flex items-start gap-2.5">
            <Info className="size-5 shrink-0 text-warning mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-foreground">
                Uploaded Without Verification
              </p>
              <p className="text-muted-foreground text-xs">
                The workbook's section information could not be extracted (e.g.
                missing or unparseable header). Attainments were recorded under
                the selected section.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Completed with Non-Blocking Warnings Notice */}
      {verificationResult &&
        verificationResult.warnings &&
        verificationResult.warnings.length > 0 && (
          <div className="rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm dark:bg-warning/20">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="size-5 shrink-0 text-warning mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold text-foreground">
                  Workbook Warnings
                </p>
                <ul className="list-inside list-disc text-xs text-muted-foreground space-y-0.5">
                  {verificationResult.warnings.map((w, idx) => (
                    <li key={idx}>{w}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

      {/* Action Bar */}
      {isMounted && (
        <div className="flex w-full justify-center items-center gap-4">
          {!isWorking && (
            <Button
              onClick={handleUpload}
              disabled={isUploadDisabled}
              className="w-48"
            >
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

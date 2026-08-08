"use client";

import { useState, useEffect } from "react";
import {
  FileUpload,
  type FileUploadItem,
} from "@/components/upload/file-upload";
import { api, isApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Loader2, AlertTriangle } from "lucide-react";

const ALLOWED_EXTENSIONS = [".csv", ".tsv", ".xls", ".xlsx"];
const ALLOWED_MIME = [
  "text/csv",
  "text/tab-separated-values",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

// Hardcoded for now, as per instructions.
const TEST_CLASS_SECTION_ID = "clv92a9f1000108l3d26b52b3";

interface UploadResult {
  etl: unknown;
  persistence: {
    computationRunId: string;
    studentsProcessed: number;
    studentsCreated: number;
    cloAttainmentsCreated: number;
    cloMatchFailures: { cloCode: string; studentName: string; reason: string }[];
  };
}

export function ClassRecordUpload() {
  const [items, setItems] = useState<FileUploadItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const file = items[0]?.file;

  async function handleUpload() {
    if (!file) return;

    setIsUploading(true);
    setUploadResult(null);
    setUploadError(null);

    try {
      const result = await api.upload<UploadResult>(
        "/ingest/upload",
        file,
        {
          classSectionId: TEST_CLASS_SECTION_ID,
        },
      );
      setUploadResult(result);
    } catch (error) {
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
    } finally {
      setIsUploading(false);
    }
  }

  function isValidFile(file: File) {
    const ext = `.${file.name.split(".").pop()?.toLowerCase() ?? ""}`;
    return ALLOWED_EXTENSIONS.includes(ext) || ALLOWED_MIME.includes(file.type);
  }

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
        disabled={isUploading}
      />
      <div className="flex items-center gap-4">
        <Button
          onClick={handleUpload}
          disabled={!file || isUploading}
          className="w-40"
        >
          {isUploading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : null}
          {isUploading ? "Uploading..." : "Upload & Process"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Uploads to class section: {TEST_CLASS_SECTION_ID}
        </p>
      </div>

      {uploadError && (
        <div className="p-4 rounded-md bg-destructive/10 text-destructive flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 mt-0.5" />
          <div>
            <p className="font-semibold">Upload Failed</p>
            <p className="text-sm">{uploadError}</p>
          </div>
        </div>
      )}

      {uploadResult && (
        <div className="p-4 rounded-md bg-muted/50">
          <h3 className="font-semibold mb-2">Processing Complete</h3>
          <pre className="text-sm p-3 bg-background rounded-md overflow-x-auto">
            {JSON.stringify(uploadResult.persistence, null, 2)}
          </pre>
        </div>
      )}
    </section>
  );
}
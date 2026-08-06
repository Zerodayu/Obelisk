"use client";

import { useState } from "react";
import {
  FileUpload,
  type FileUploadItem,
} from "@/components/upload/file-upload";

const ALLOWED_EXTENSIONS = [".csv", ".tsv", ".xls", ".xlsx"];
const ALLOWED_MIME = [
  "text/csv",
  "text/tab-separated-values",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

/**
 * Class-record upload for `/forms/clo-raw-data`. Mirrors the prior `/faculty`
 * preview UX. When the backend ingest contract lands, submission will POST the
 * file via `lib/api.ts` → `POST /ingest/upload` and poll the ETL job.
 */
export function ClassRecordUpload() {
  const [items, setItems] = useState<FileUploadItem[]>([]);

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
      />
      <p className="text-xs text-muted-foreground">
        Files are validated client-side; upload to the backend ingest endpoint
        is wired via the API client once the backend contract is live.
      </p>
    </section>
  );
}

"use client";

import { ArrowUpRightIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { formPathByCode } from "@/config/navigation";
import { api } from "@/lib/api-client";

/**
 * Mirrors `SubmissionEvidence` from `apps/backend/src/v1/forms/service.ts`
 * (`GET /forms/:id/evidence`). Counts only — the backend never returns raw
 * student scores to this endpoint, so any reviewer in the approval chain can
 * read it.
 */
export interface SubmissionEvidenceRecord {
  code: string;
  classSectionId: string | null;
  formData: Record<string, unknown>;
  classSection: {
    id: string;
    sectionCode: string;
    course: { code: string; title: string };
    term: { schoolYear: string; semester: string };
  } | null;
  capture: {
    attainmentRows: number;
    students: number;
    belowThresholdRows: number;
    atRiskStudents: number;
    computationRunId: string | null;
    runAt: string | null;
  } | null;
}

/** One server-computed counter; `highlight` reddens non-zero problem counts. */
function Stat({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-2">
      <p
        className={`text-lg font-semibold tabular-nums ${
          highlight && value > 0 ? "text-destructive" : ""
        }`}
      >
        {value}
      </p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

/**
 * Read-only evidence panel for the approval screen: the bound class section
 * (course/term), the capture summary for it (rows, students, below-threshold,
 * at-risk, latest computation run), and the stored `formData` payload. Data
 * comes from `GET /forms/:id/evidence` — nothing is derived client-side.
 */
export function SubmissionEvidence({ submissionId }: { submissionId: string }) {
  const [evidence, setEvidence] = useState<SubmissionEvidenceRecord | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setEvidence(
        await api.get<SubmissionEvidenceRecord>(
          `/forms/${submissionId}/evidence`,
        ),
      );
      setError(false);
    } catch {
      // The screen already passed the visibility gate; a failed refresh just
      // leaves the panel empty with a retry-free muted note.
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [submissionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const formPath = evidence ? formPathByCode[evidence.code] : undefined;
  const payload = evidence ? Object.entries(evidence.formData ?? {}) : [];
  const section = evidence?.classSection ?? null;
  const capture = evidence?.capture ?? null;

  return (
    <section className="space-y-4 rounded-xl border bg-card p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold">Evidence</h3>
          {evidence ? (
            <span className="font-mono text-xs text-muted-foreground">
              {evidence.code}
            </span>
          ) : null}
        </div>
        {formPath ? (
          <Button asChild size="sm" variant="ghost">
            <Link href={formPath}>
              Open form screen <ArrowUpRightIcon />
            </Link>
          </Button>
        ) : null}
      </div>

      {loading && !evidence ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner className="size-4" /> Loading evidence…
        </div>
      ) : error || !evidence ? (
        <p className="text-sm text-muted-foreground">
          Evidence could not be loaded for this submission.
        </p>
      ) : (
        <div className="space-y-4">
          {section ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">
                  {section.course.code} · Section {section.sectionCode}
                </span>
                <span className="text-xs text-muted-foreground">
                  {section.course.title} — {section.term.schoolYear},{" "}
                  {section.term.semester} semester
                </span>
              </div>
              {capture ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Stat
                    label="Attainment rows"
                    value={capture.attainmentRows}
                  />
                  <Stat label="Students" value={capture.students} />
                  <Stat
                    highlight
                    label="Below 70% rows"
                    value={capture.belowThresholdRows}
                  />
                  <Stat
                    highlight
                    label="At-risk students"
                    value={capture.atRiskStudents}
                  />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No class records captured for this section yet.
                </p>
              )}
              {capture?.computationRunId ? (
                <p className="text-xs text-muted-foreground">
                  Latest computation{" "}
                  <span className="font-mono">
                    {capture.computationRunId.slice(0, 8)}
                  </span>
                  {capture.runAt
                    ? ` · ${new Date(capture.runAt).toLocaleString()}`
                    : ""}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No class section bound to this submission.
            </p>
          )}

          {payload.length > 0 ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">Stored payload</p>
              <pre className="max-h-80 overflow-auto rounded-lg border bg-muted/30 p-3 text-xs">
                {JSON.stringify(evidence.formData, null, 2)}
              </pre>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No stored payload — the content lives on the form screen.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

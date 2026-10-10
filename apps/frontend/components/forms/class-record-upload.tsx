"use client";

import { useAtomValue, useSetAtom } from "jotai";
import {
	AlertCircle,
	AlertTriangle,
	CheckCircle2,
	Info,
	RotateCcw,
	X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { ContextRequired } from "@/components/forms/context-required";
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
	ingestPreviewAtom,
	ingestStatusAtom,
	markProcessingAtom,
	markReviewAtom,
	markSavingAtom,
	refreshUploadHistoryAtom,
	resetIngestAtom,
	type SectionComparisonResult,
	selectedClassSectionIdAtom,
	startUploadAtom,
	type UploadPreview,
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
	status: "queued" | "running" | "ready" | "completed" | "failed";
	/** Set on `ready` — the pre-save summary; nothing is persisted yet. */
	preview?: UploadPreview;
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

/** One count in the review panel's stats grid. */
function ReviewStat({ label, value }: { label: string; value: number }) {
	return (
		<div className="border-border bg-muted/40 rounded-lg border px-3 py-2">
			<dt className="text-muted-foreground text-xs">{label}</dt>
			<dd className="text-foreground text-lg font-semibold">{value}</dd>
		</div>
	);
}

export function ClassRecordUpload() {
	const [items, setItems] = useState<FileUploadItem[]>([]);
	// NOTE: the section lives in an atom so the approval-workflow strip above
	// can bind its `clo_raw_data` draft to the same class section.
	const classSectionId = useAtomValue(selectedClassSectionIdAtom);
	const [isMounted, setIsMounted] = useState(false);
	// NOTE: the section the in-flight job was started with — the dashboard can
	// change the global section mid-upload, but polling must keep querying the
	// one the job is bound to or the backend answers 400 (section mismatch).
	const sectionAtUploadRef = useRef("");

	// Verification outcome state for persistent contextual notices
	const [verificationResult, setVerificationResult] =
		useState<SectionComparisonResult | null>(null);
	const [mismatchError, setMismatchError] = useState<{
		message: string;
		mismatches: string[];
	} | null>(null);

	const status = useAtomValue(ingestStatusAtom);
	const jobId = useAtomValue(ingestJobIdAtom);
	const preview = useAtomValue(ingestPreviewAtom);

	const setStartUpload = useSetAtom(startUploadAtom);
	const setMarkProcessing = useSetAtom(markProcessingAtom);
	const setMarkReview = useSetAtom(markReviewAtom);
	const setMarkSaving = useSetAtom(markSavingAtom);
	const setCompleteIngest = useSetAtom(completeIngestAtom);
	const setFailIngest = useSetAtom(failIngestAtom);
	const setResetIngest = useSetAtom(resetIngestAtom);
	const setRefreshHistory = useSetAtom(refreshUploadHistoryAtom);

	useEffect(() => {
		setIsMounted(true);
	}, []);

	const file = items[0]?.file;
	const isWorking =
		status === "uploading" || status === "processing" || status === "saving";

	const patchItem = useCallback((patch: Partial<FileUploadItem>) => {
		setItems((prev) =>
			prev.length === 0 ? prev : [{ ...prev[0], ...patch }, ...prev.slice(1)],
		);
	}, []);

	// NOTE: a reviewed job was never saved — discard it server-side first or its
	// history row stays `queued` forever (best-effort, section bound at upload).
	const discardReviewed = useCallback(() => {
		if (status !== "review" || !jobId) return;
		void api
			.post(`/ingest/upload/${jobId}/discard`, {
				classSectionId: sectionAtUploadRef.current,
			})
			.catch(() => {
				/* best-effort — a failed discard only leaves a stale history row */
			});
	}, [status, jobId]);

	// NOTE: the section is owned by the dashboard picker now — clear stale
	// verification/ingest state when it changes underneath an idle panel
	// (replaces the old handleSectionChange on the removed local select).
	useEffect(() => {
		if (isWorking) return;
		// A review in progress was never saved — drop it too, or the history row
		// would stay `queued`.
		discardReviewed();
		setVerificationResult(null);
		setMismatchError(null);
		setResetIngest();
		// Reset any item error state so it shows ready to upload
		if (items.length > 0 && items[0]?.status === "error") {
			patchItem({ status: "queued", error: undefined, progress: 0 });
		}
		// NOTE: deps intentionally only the section — items/status churn must not
		// wipe a just-recorded verification result.
	}, [classSectionId]);

	// Resets the uploaded file so user can pick a different workbook.
	const handleResetFile = useCallback(() => {
		discardReviewed();
		setItems([]);
		setVerificationResult(null);
		setMismatchError(null);
		setResetIngest();
	}, [discardReviewed, setResetIngest]);

	// Applies a saved job's result to the panel — shared by the poll loop and
	// the save call.
	const completeJob = useCallback(
		(res: StatusResponse) => {
			const summary = res.persistence;
			const verification = res.verification ?? summary?.verification ?? null;

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
				} else if (verification?.warnings && verification.warnings.length > 0) {
					toast.warning({
						id: "ingest:verification-warnings",
						title: "Workbook Warnings",
						description: verification.warnings.join(" · "),
					});
				}
			}
		},
		[patchItem, setCompleteIngest, setRefreshHistory],
	);

	// Shared failure path for upload, poll and save. `mismatches` renders the
	// section-mismatch panel instead of the plain error notice.
	const failJob = useCallback(
		(
			message: string,
			opts: { mismatches?: string[]; status?: number } = {},
		) => {
			patchItem({ status: "error", error: message });
			setFailIngest(message);
			setRefreshHistory();

			if (opts.mismatches) {
				setMismatchError({ message, mismatches: opts.mismatches });
				toastError({
					scope: "ingest:section-mismatch",
					title: "Section Mismatch",
					description: message,
				});
			} else {
				setMismatchError(null);
				toastError({
					status: opts.status,
					scope: "ingest",
					title: "Upload Failed",
					description: message,
				});
			}
		},
		[patchItem, setFailIngest, setRefreshHistory],
	);

	// Poll the ETL job while it is `processing`
	useEffect(() => {
		if (!jobId || status !== "processing") return;

		let disposed = false;
		const currentSectionId = sectionAtUploadRef.current;

		const interval = setInterval(async () => {
			try {
				const res = await api.get<StatusResponse>(
					`/ingest/upload/${jobId}/status`,
					{ query: { classSectionId: currentSectionId } },
				);

				if (disposed) return;

				if (res.status === "ready" && res.preview) {
					// NOTE: nothing was written server-side — the Save/Re-upload step
					// takes over (the status flip stops this effect).
					patchItem({ status: "success", progress: 100 });
					setMarkReview(res.preview);
				} else if (res.status === "completed") {
					completeJob(res);
				} else if (res.status === "failed") {
					const isMismatch = res.error?.error_type === "SectionMismatchError";
					const message = res.error?.message || "Processing failed.";

					failJob(
						message,
						isMismatch
							? { mismatches: res.error?.verification?.mismatches ?? [message] }
							: {},
					);
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

				failJob(message, { status: errStatus });
			}
		}, POLL_INTERVAL_MS);

		return () => {
			disposed = true;
			clearInterval(interval);
		};
	}, [jobId, status, patchItem, completeJob, failJob, setMarkReview]);

	async function handleUpload() {
		if (!file || !classSectionId.trim()) return;

		sectionAtUploadRef.current = classSectionId.trim();
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

			failJob(message, { status: errStatus });
			console.error(error);
		}
	}

	// Saves the reviewed job — the backend writes the DB rows exactly once.
	async function handleSave() {
		if (!jobId || !sectionAtUploadRef.current) return;

		const jobToSave = jobId;
		setMarkSaving();
		setVerificationResult(null);
		setMismatchError(null);

		try {
			const res = await api.post<StatusResponse>(
				`/ingest/upload/${jobToSave}/save`,
				{ classSectionId: sectionAtUploadRef.current },
			);

			if (res.status === "completed") {
				completeJob(res);
			} else if (res.status === "failed") {
				const isMismatch = res.error?.error_type === "SectionMismatchError";
				const message = res.error?.message || "Saving failed.";

				failJob(
					message,
					isMismatch
						? { mismatches: res.error?.verification?.mismatches ?? [message] }
						: {},
				);
			} else {
				// Still running server-side (e.g. another save in flight) — poll it out.
				setMarkProcessing(jobToSave);
			}
		} catch (error) {
			let message = "An unexpected error occurred while saving.";
			let errStatus: number | undefined;

			if (isApiError(error)) {
				errStatus = error.status;
				if (error.status === 400 || error.status === 404) {
					message =
						error.payload?.error || error.payload?.message || error.message;
				} else {
					message = `Save failed (status ${error.status}): ${
						error.payload?.error || error.payload?.message || error.message
					}`;
				}
			}

			failJob(message, { status: errStatus });
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
	const progressLabel =
		status === "saving"
			? "Saving class record…"
			: isUploading
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
			{/* Class section comes from the Academic Context card on the Dashboard. */}
			{!classSectionId ? <ContextRequired scope="class-section" /> : null}

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
				<div className="border-destructive/30 bg-destructive/10 text-destructive-foreground dark:bg-destructive/20 rounded-xl border p-4 text-sm">
					<div className="flex items-start justify-between gap-3">
						<div className="flex items-start gap-2.5">
							<AlertCircle className="text-destructive mt-0.5 size-5 shrink-0" />
							<div className="space-y-1">
								<p className="text-foreground font-semibold">
									Section Verification Mismatch
								</p>
								<p className="text-muted-foreground">{mismatchError.message}</p>
								{mismatchError.mismatches.length > 0 && (
									<ul className="text-muted-foreground list-inside list-disc pt-1 text-xs">
										{mismatchError.mismatches.map((m, idx) => (
											<li key={idx}>{m}</li>
										))}
									</ul>
								)}
								<p className="text-muted-foreground pt-2 text-xs">
									<span className="text-foreground font-medium">Hint:</span>{" "}
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
							<X className="mr-1 size-3.5" />
							Reset file
						</Button>
					</div>
				</div>
			)}

			{/* Unverified Warning Notice */}
			{verificationResult?.status === "unverified" && (
				<div className="border-warning/30 bg-warning/10 dark:bg-warning/20 rounded-xl border p-4 text-sm">
					<div className="flex items-start gap-2.5">
						<Info className="text-warning mt-0.5 size-5 shrink-0" />
						<div className="space-y-1">
							<p className="text-foreground font-semibold">
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
					<div className="border-warning/30 bg-warning/10 dark:bg-warning/20 rounded-xl border p-4 text-sm">
						<div className="flex items-start gap-2.5">
							<AlertTriangle className="text-warning mt-0.5 size-5 shrink-0" />
							<div className="space-y-1">
								<p className="text-foreground font-semibold">
									Workbook Warnings
								</p>
								<ul className="text-muted-foreground list-inside list-disc space-y-0.5 text-xs">
									{verificationResult.warnings.map((w, idx) => (
										<li key={idx}>{w}</li>
									))}
								</ul>
							</div>
						</div>
					</div>
				)}

			{/* Review step: ETL finished, DB untouched — Save or Re-upload */}
			{status === "review" && preview && (
				<div className="border-border bg-background space-y-4 rounded-xl border p-4 text-sm">
					<div className="space-y-1">
						<p className="text-foreground flex items-center gap-2 font-semibold">
							<CheckCircle2 className="text-success size-5" />
							Ready to save
						</p>
						<p className="text-muted-foreground text-xs">
							Parsed class record — nothing is written until you save it.
						</p>
						{preview.setup &&
							(preview.setup.course_code ||
								preview.setup.term ||
								preview.setup.faculty_name) && (
								<p className="text-muted-foreground text-xs">
									{[
										preview.setup.course_code,
										preview.setup.term,
										preview.setup.faculty_name,
									]
										.filter(Boolean)
										.join(" · ")}
								</p>
							)}
					</div>

					{/* Parsed counts */}
					<dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
						<ReviewStat label="Students" value={preview.students} />
						<ReviewStat label="CLO rows" value={preview.rows} />
						<ReviewStat label="At-risk" value={preview.atRisk} />
						<ReviewStat
							label="Skipped rows"
							value={preview.unmatchedClos.reduce((sum, c) => sum + c.rows, 0)}
						/>
					</dl>

					{/* Verification outcome — the same rule the save enforces */}
					{preview.verification.status === "mismatch" ? (
						<div className="border-destructive/30 bg-destructive/10 dark:bg-destructive/20 rounded-lg border p-3">
							<p className="text-foreground flex items-center gap-2 font-semibold">
								<AlertCircle className="text-destructive size-4" />
								Section mismatch — saving is blocked
							</p>
							<ul className="text-muted-foreground mt-1 list-inside list-disc text-xs">
								{preview.verification.mismatches.map((m, idx) => (
									<li key={idx}>{m}</li>
								))}
							</ul>
						</div>
					) : preview.verification.status === "unverified" ? (
						<p className="text-muted-foreground flex items-center gap-2 text-xs">
							<Info className="text-warning size-4 shrink-0" />
							Workbook section could not be verified — it will be saved under
							the selected section.
						</p>
					) : (
						<p className="text-success flex items-center gap-2 text-xs">
							<CheckCircle2 className="size-4 shrink-0" />
							Workbook section matches the selected section.
						</p>
					)}

					{preview.verification.warnings.length > 0 && (
						<ul className="text-muted-foreground list-inside list-disc space-y-0.5 text-xs">
							{preview.verification.warnings.map((w, idx) => (
								<li key={idx}>{w}</li>
							))}
						</ul>
					)}

					{preview.unmatchedClos.length > 0 && (
						<p className="text-muted-foreground text-xs">
							Unmatched CLO codes (rows skipped on save):{" "}
							{preview.unmatchedClos
								.map((c) => `${c.cloCode} (${c.rows})`)
								.join(", ")}
						</p>
					)}

					<div className="flex justify-end gap-2">
						<Button variant="outline" onClick={handleResetFile}>
							<RotateCcw className="mr-1.5 size-4" />
							Re-upload
						</Button>
						<Button
							onClick={handleSave}
							disabled={preview.verification.status === "mismatch"}
						>
							<CheckCircle2 className="mr-1.5 size-4" />
							Save class record
						</Button>
					</div>
				</div>
			)}

			{/* Action Bar */}
			{isMounted && status !== "review" && (
				<div className="flex w-full items-center justify-center gap-4">
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
								className="flex items-center justify-center"
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

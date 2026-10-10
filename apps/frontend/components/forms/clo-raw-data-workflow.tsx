"use client";

import { useAtomValue } from "jotai";
import { useCallback, useEffect, useState } from "react";

import { SubmissionStatusCard } from "@/components/forms/submission-status-card";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { toastError } from "@/components/ui/toast";
import { api, isApiError } from "@/lib/api-client";
import { selectedClassSectionIdAtom } from "@/lib/store/atoms/ingest";
import { initCloRawDataAction } from "@/server/actions/forms";

/**
 * Approval-workflow strip for `/forms/clo-raw-data` — renders a "Start
 * submission" prompt until a `clo_raw_data` draft exists for the selected class
 * section (`POST /ingest/clo-raw-data/init`, idempotent), then the shared
 * `FormWorkflow` bar, whose Submit derives the chain from
 * `backend/lib/forms/approval-routes.ts` (`clo_raw_data` enters at
 * program_chair and ascends to vpaa).
 */
export function CloRawDataWorkflow() {
	const classSectionId = useAtomValue(selectedClassSectionIdAtom);
	const [submissionId, setSubmissionId] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [starting, setStarting] = useState(false);

	// Re-look up the section's submission whenever the selected section changes.
	const load = useCallback(async () => {
		if (!classSectionId) {
			setSubmissionId(null);
			return;
		}
		setLoading(true);
		try {
			const result = await api.get<{ formSubmissionId: string | null }>(
				"/ingest/clo-raw-data/submission",
				{ query: { classSectionId } },
			);
			setSubmissionId(result.formSubmissionId);
		} catch (error) {
			// Stay in the prompt state; the toast names what went wrong.
			setSubmissionId(null);
			toastError({
				status: isApiError(error) ? error.status : undefined,
				scope: "clo-raw-data:lookup",
				title: "Could not load the submission",
				description: isApiError(error) ? error.message : undefined,
			});
		} finally {
			setLoading(false);
		}
	}, [classSectionId]);

	useEffect(() => {
		void load();
	}, [load]);

	async function handleStart() {
		if (!classSectionId || starting) return;
		setStarting(true);
		try {
			const result = await initCloRawDataAction(classSectionId);
			if (!result.ok) {
				toastError({
					status: result.status,
					scope: "clo-raw-data:init",
					title: "Could not start the submission",
					description: result.error,
				});
				return;
			}
			setSubmissionId(result.data.formSubmissionId);
		} finally {
			setStarting(false);
		}
	}

	if (!classSectionId) {
		return (
			<section className="bg-muted/30 text-muted-foreground rounded-xl border border-dashed p-4 text-sm">
				Select a class section below to start a submission.
			</section>
		);
	}

	if (loading) {
		return (
			<section className="bg-card rounded-xl border p-4 shadow-sm">
				<div className="text-muted-foreground flex items-center gap-2 text-sm">
					<Spinner className="size-4" /> Loading approval status…
				</div>
			</section>
		);
	}

	if (!submissionId) {
		return (
			<section className="bg-muted/30 rounded-xl border border-dashed p-4">
				<div className="text-muted-foreground flex flex-wrap items-center justify-between gap-3 text-sm">
					<span>
						No submission for this section yet — capture the class record, then
						start the approval workflow.
					</span>
					<Button
						size="sm"
						disabled={starting}
						onClick={() => void handleStart()}
					>
						{starting ? "Starting…" : "Start submission"}
					</Button>
				</div>
			</section>
		);
	}

	return <SubmissionStatusCard submissionId={submissionId} />;
}

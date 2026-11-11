"use client";

import { useAtomValue } from "jotai";
import { useCallback, useEffect, useState } from "react";

import { renderMarkdown } from "@/components/dashboard/ai-suggestions-drawer";
import {
	LoopStatusBanner,
	useLoopStatus,
} from "@/components/forms/loop-status-banner";
import {
	Frame,
	FrameDescription,
	FrameHeader,
	FramePanel,
	FrameTitle,
} from "@/components/reui/frame";
import { Button } from "@/components/ui/button";
import { toast, toastError } from "@/components/ui/toast";
import {
	selectedProgramIdAtom,
	selectedTermIdAtom,
} from "@/lib/store/atoms/academic";
import { userAtom } from "@/lib/store/atoms/user";
import {
	type AiRecommendation,
	getLatestAiRecommendationAction,
} from "@/server/actions/ai";
import { adoptRecommendationAction } from "@/server/actions/cqi";

const STATUS_LABELS: Record<string, string> = {
	pending_review: "Pending review",
	acknowledged: "Acknowledged",
	actioned: "Actioned",
	dismissed: "Dismissed",
};

const LOOP_STEPS = [
	{
		title: "Propose",
		body: "VPAA generates an institution-wide AI proposal from stored attainment data. Generation is passive — it triggers nothing on its own.",
	},
	{
		title: "Adopt",
		body: "The Program Chair adopts the proposal into the program's F23 CQI Action Plan, confirming or editing the root cause and intervention.",
	},
	{
		title: "Implement",
		body: "Faculty carry out the interventions and attach implementation evidence.",
	},
	{
		title: "Close the loop",
		body: "The next cycle's data drives the Closing-the-Loop (F25) status; the identify step feeds the next PLAN.",
	},
] as const;

/**
 * CQI-area view of the VPAA-generated AI proposal. Explains where the proposal
 * sits in the CQI & Loop, then offers the single human trigger: adopt
 * (Program Chair). The AI generation stays passive.
 */
export function AiRecommendationsForm() {
	const user = useAtomValue(userAtom);
	const programId = useAtomValue(selectedProgramIdAtom);
	const termId = useAtomValue(selectedTermIdAtom);
	const loopStatus = useLoopStatus();

	const [recommendation, setRecommendation] = useState<AiRecommendation | null>(
		null,
	);
	const [loading, setLoading] = useState(true);
	const [message, setMessage] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	const canAdopt =
		user?.role === "program_chair" || user?.role === "system_admin";

	const load = useCallback(async () => {
		setLoading(true);
		const result = await getLatestAiRecommendationAction();
		setLoading(false);
		if (result.ok) {
			setRecommendation(result.data);
			setMessage(null);
		} else {
			setMessage(result.error);
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	const adopt = useCallback(async () => {
		if (!recommendation || !programId?.trim() || !termId?.trim()) return;
		setBusy(true);
		const result = await adoptRecommendationAction({
			recommendationId: recommendation.id,
			programId: programId.trim(),
			termId: termId.trim(),
		});
		setBusy(false);
		if (result.ok) {
			toast.create({
				title: "Adopted into the CQI action plan",
				type: "success",
			});
		} else {
			toastError({
				title: "Adopt failed",
				description: result.error,
				scope: "ai-recommendations:adopt",
			});
		}
	}, [recommendation, programId, termId]);

	const adopted = loopStatus?.adoptedRecommendationId === recommendation?.id;

	return (
		<Frame className="m-6">
			<FrameHeader>
				<FrameTitle>AI Proposal &amp; Adopt</FrameTitle>
				<FrameDescription>
					The VPAA-generated institutional proposal and the human action that
					moves it into the CQI &amp; Loop.
				</FrameDescription>
			</FrameHeader>

			<FramePanel className="space-y-5">
				<LoopStatusBanner status={loopStatus} />

				{/* Where the proposal sits in the loop */}
				<div>
					<h3 className="mb-2 text-sm font-semibold">
						Where this fits in the CQI &amp; Loop
					</h3>
					<ol className="text-muted-foreground list-decimal space-y-1.5 pl-5 text-sm">
						{LOOP_STEPS.map((step) => (
							<li key={step.title}>
								<span className="text-foreground font-medium">
									{step.title}
								</span>{" "}
								— {step.body}
							</li>
						))}
					</ol>
				</div>

				{loading ? (
					<p className="text-muted-foreground text-sm">Loading…</p>
				) : message ? (
					<p className="text-muted-foreground text-sm">{message}</p>
				) : recommendation ? (
					<>
						<div className="flex flex-wrap items-center gap-2">
							<span className="bg-muted text-muted-foreground rounded-full px-2.5 py-0.5 text-xs font-medium">
								{STATUS_LABELS[recommendation.status] ?? recommendation.status}
							</span>
							<span className="text-muted-foreground text-xs">
								Generated{" "}
								{new Date(recommendation.generatedAt).toLocaleString()}
							</span>
						</div>

						<div className="typeset typeset-docs">
							{renderMarkdown(recommendation.recommendationText)}
						</div>

						{recommendation.worstPerformingClos.length > 0 ? (
							<div>
								<h3 className="mb-2 text-sm font-semibold">
									Key gaps (computed)
								</h3>
								<ul className="text-muted-foreground list-disc space-y-1 pl-5 text-sm">
									{recommendation.worstPerformingClos.map((clo) => (
										<li key={clo.key}>
											{clo.cloCode} — {clo.meanAttainmentPct.toFixed(1)}% (
											{clo.recordCount} records)
										</li>
									))}
								</ul>
							</div>
						) : null}

						{canAdopt ? (
							<div>
								<h3 className="mb-1 text-sm font-semibold">
									Adopt (Program Chair)
								</h3>
								<p className="text-muted-foreground mb-2 text-sm">
									Adopting opens your program&apos;s CQI Action Plan draft and
									seeds it from the program&apos;s open F22 gaps, recording this
									recommendation as the source. You then confirm and edit each
									entry.
								</p>
								<div className="flex flex-wrap items-center gap-2">
									<Button
										disabled={
											busy || adopted || !programId?.trim() || !termId?.trim()
										}
										onClick={() => void adopt()}
									>
										{adopted ? "Adopted" : "Adopt into action plan"}
									</Button>
									{adopted ? (
										<span className="text-muted-foreground text-xs">
											Already adopted for this term.
										</span>
									) : !programId?.trim() || !termId?.trim() ? (
										<span className="text-muted-foreground text-xs">
											Select a program and term first.
										</span>
									) : null}
								</div>
							</div>
						) : null}
					</>
				) : (
					<p className="text-muted-foreground text-sm">
						No AI recommendation generated yet.
					</p>
				)}
			</FramePanel>
		</Frame>
	);
}

"use client";

import { useAtomValue } from "jotai";
import { useCallback, useEffect, useState } from "react";

import { renderMarkdown } from "@/components/dashboard/ai-suggestions-drawer";
import { LoopStatusBanner } from "@/components/forms/loop-status-banner";
import {
	Frame,
	FrameDescription,
	FrameHeader,
	FramePanel,
	FrameTitle,
} from "@/components/reui/frame";
import { Button } from "@/components/ui/button";
import { toast, toastError } from "@/components/ui/toast";
import { canAccess } from "@/lib/role-access";
import {
	selectedProgramIdAtom,
	selectedTermIdAtom,
} from "@/lib/store/atoms/academic";
import { userAtom } from "@/lib/store/atoms/user";
import {
	type AiRecommendation,
	getLatestAiRecommendationAction,
	reviewAiRecommendationAction,
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
		title: "Review",
		body: "AQAU/VPAA review the proposal and mark it acknowledged, actioned, or dismissed.",
	},
	{
		title: "Adopt",
		body: "The Program Chair adopts the actioned proposal into the program's F23 CQI Action Plan, confirming or editing the root cause and intervention.",
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
 * sits in the CQI & Loop, then offers the two human triggers: review
 * (AQAU/VPAA) and adopt (Program Chair). The AI generation stays passive.
 */
export function AiRecommendationsForm() {
	const user = useAtomValue(userAtom);
	const programId = useAtomValue(selectedProgramIdAtom);
	const termId = useAtomValue(selectedTermIdAtom);

	const [recommendation, setRecommendation] = useState<AiRecommendation | null>(
		null,
	);
	const [loading, setLoading] = useState(true);
	const [message, setMessage] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	const canReview = canAccess(user?.role, "viewAiInsights");
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

	const review = useCallback(
		async (status: "acknowledged" | "actioned" | "dismissed") => {
			if (!recommendation) return;
			setBusy(true);
			const result = await reviewAiRecommendationAction(
				recommendation.id,
				status,
			);
			setBusy(false);
			if (result.ok) {
				setRecommendation(result.data);
				toast.create({
					title: `Recommendation ${STATUS_LABELS[status].toLowerCase()}`,
					type: "success",
				});
			} else {
				toastError({
					title: "Review failed",
					description: result.error,
					scope: "ai-recommendations:review",
				});
			}
		},
		[recommendation],
	);

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

	return (
		<Frame className="m-6">
			<FrameHeader>
				<FrameTitle>AI Recommendations</FrameTitle>
				<FrameDescription>
					The VPAA-generated institutional proposal and the two human actions
					that move it into the CQI &amp; Loop.
				</FrameDescription>
			</FrameHeader>

			<FramePanel className="space-y-5">
				<LoopStatusBanner />

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

						{canReview ? (
							<div>
								<h3 className="mb-1 text-sm font-semibold">
									Review (AQAU / VPAA)
								</h3>
								<p className="text-muted-foreground mb-2 text-sm">
									The review does not act on anything — it only marks the
									proposal&apos;s status. Adopting is a separate, program-level
									step.
								</p>
								<div className="flex flex-wrap items-center gap-2">
									<Button
										size="sm"
										variant="outline"
										disabled={busy}
										onClick={() => void review("acknowledged")}
									>
										Acknowledge
									</Button>
									<Button
										size="sm"
										disabled={busy}
										onClick={() => void review("actioned")}
									>
										Action
									</Button>
									<Button
										size="sm"
										variant="ghost"
										disabled={busy}
										onClick={() => void review("dismissed")}
									>
										Dismiss
									</Button>
								</div>
								<p className="text-muted-foreground mt-2 text-xs">
									Acknowledge = noted, no action yet · Action = adoptable by
									Program Chairs · Dismiss = rejected.
								</p>
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
										size="sm"
										disabled={busy || !programId?.trim() || !termId?.trim()}
										onClick={() => void adopt()}
									>
										Adopt into action plan
									</Button>
									{!programId?.trim() || !termId?.trim() ? (
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

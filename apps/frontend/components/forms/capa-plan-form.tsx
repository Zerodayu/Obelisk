"use client";

import { useAtomValue } from "jotai";
import { useCallback, useEffect, useState } from "react";

import { ContextRequired } from "@/components/forms/context-required";
import { GeneratingState } from "@/components/forms/generating";
import { SubmissionStatusCard } from "@/components/forms/submission-status-card";
import {
	Frame,
	FrameDescription,
	FrameHeader,
	FramePanel,
	FrameTitle,
} from "@/components/reui/frame";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { FormSelect } from "@/components/ui/form-select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast, toastError } from "@/components/ui/toast";
import { useAutoGenerate } from "@/lib/hooks/use-auto-generate";
import type { PeriodicFormCode } from "@/lib/periodic-slugs";
import {
	selectedProgramIdAtom,
	selectedTermIdAtom,
} from "@/lib/store/atoms/academic";
import {
	getPeriodicForm,
	initPeriodicForm,
	listPeriodicForm,
	savePeriodicForm,
} from "@/server/actions/periodic";

const FORM_CODE: PeriodicFormCode = "capa_plan";

/** The backend caps the action table at 8 rows (`CapaPlanService.save`). */
const MAX_ACTIONS = 8;

interface CapaAction {
	actionId?: string;
	description: string;
	interventionType?: string;
	owner?: string;
	targetCompletionDate?: string;
	progressPct?: number;
	evidenceUrl?: string;
}

interface ProgressReview {
	reviewDate: string;
	ploAttainmentAtReview?: number;
	status?: string;
	actionsCompletedPct?: number;
	aqauNotes?: string;
}

interface Payload {
	id: string;
	status: string;
	header: {
		program?: string;
		ploCodes?: string[];
		cohortCodes?: string[];
		systemicGapReportId?: string;
		startDate?: string;
		seniorLeaderOwner?: string;
		dean?: string;
		expectedResolutionAy?: string;
		aqauMonitoringFrequency?: string;
	};
	actions: CapaAction[];
	progressReviews: ProgressReview[];
	closureDeclaration?: string | null;
	benchmarkSustainedCycles?: number;
}

function joinList(values?: string[]): string {
	return (values ?? []).join(", ");
}

function splitList(value: string): string[] {
	return value
		.split(",")
		.map((part) => part.trim())
		.filter(Boolean);
}

export default function CapaPlanForm() {
	const [payload, setPayload] = useState<Payload | null>(null);
	const [approvedGaps, setApprovedGaps] = useState<
		Array<{ id: string; label: string }>
	>([]);
	const programId = useAtomValue(selectedProgramIdAtom);
	const termId = useAtomValue(selectedTermIdAtom);
	const [loading, setLoading] = useState(false);
	const [saving, setSaving] = useState(false);

	// NOTE: F27 submit gate — the referenced Systemic Gap Report must be approved.
	useEffect(() => {
		if (!programId || !termId) return;
		void (async () => {
			const result = await listPeriodicForm("systemic_gap_report", {
				programId,
				termId,
			});
			if (result.ok) {
				setApprovedGaps(
					result.data
						.filter((item) => item.status === "approved")
						.map((item) => ({
							id: item.id,
							label: `${item.program?.code ?? "Program"} · ${new Date(
								item.updatedAt,
							).toLocaleDateString()}`,
						})),
				);
			}
		})();
	}, [programId, termId]);

	const handleInit = useCallback(async () => {
		setLoading(true);
		try {
			const result = await initPeriodicForm(FORM_CODE, { programId, termId });
			if (result.ok) {
				const payloadResult = await getPeriodicForm<Payload>(
					FORM_CODE,
					result.data.id,
				);
				if (payloadResult.ok) {
					setPayload(payloadResult.data);
					toast.create({ title: "Form initialized", type: "success" });
				} else {
					toastError({
						title: "Load failed",
						description: payloadResult.error,
						scope: "periodic:load",
					});
				}
			} else {
				toastError({
					title: "Init failed",
					description: result.error,
					scope: "periodic:init",
				});
			}
		} finally {
			setLoading(false);
		}
	}, [programId, termId]);

	const auto = useAutoGenerate([programId, termId], handleInit);

	const handleSave = useCallback(async () => {
		if (!payload) return;
		setSaving(true);
		try {
			const result = await savePeriodicForm<Payload>(FORM_CODE, payload.id, {
				header: payload.header,
				actions: payload.actions.map((row) => ({
					actionId: row.actionId,
					description: row.description,
					interventionType: row.interventionType ?? undefined,
					owner: row.owner ?? undefined,
					targetCompletionDate: row.targetCompletionDate ?? undefined,
					progressPct: row.progressPct,
					evidenceUrl: row.evidenceUrl ?? undefined,
				})),
				progressReviews: payload.progressReviews.map((row) => ({
					reviewDate: row.reviewDate,
					ploAttainmentAtReview: row.ploAttainmentAtReview,
					status: row.status ?? undefined,
					actionsCompletedPct: row.actionsCompletedPct,
					aqauNotes: row.aqauNotes ?? undefined,
				})),
				closureDeclaration: payload.closureDeclaration ?? undefined,
				benchmarkSustainedCycles: payload.benchmarkSustainedCycles,
			});
			if (result.ok) {
				setPayload(result.data);
				toast.create({ title: "Saved successfully", type: "success" });
			} else {
				toastError({
					title: "Save failed",
					description: result.error,
					scope: "periodic:save",
				});
			}
		} finally {
			setSaving(false);
		}
	}, [payload]);

	function updateHeader(
		field: string,
		value: string | number | string[] | undefined,
	) {
		setPayload((prev) =>
			prev ? { ...prev, header: { ...prev.header, [field]: value } } : prev,
		);
	}

	function updateAction(
		idx: number,
		field: keyof CapaAction,
		value: string | number,
	) {
		setPayload((prev) => {
			if (!prev) return prev;
			const rows = prev.actions.map((row, i) =>
				i === idx ? { ...row, [field]: value } : row,
			);
			return { ...prev, actions: rows };
		});
	}

	function addAction() {
		setPayload((prev) =>
			prev && prev.actions.length < MAX_ACTIONS
				? {
						...prev,
						actions: [...prev.actions, { description: "", progressPct: 0 }],
					}
				: prev,
		);
	}

	function removeAction(idx: number) {
		setPayload((prev) =>
			prev
				? { ...prev, actions: prev.actions.filter((_, i) => i !== idx) }
				: prev,
		);
	}

	function updateReview(
		idx: number,
		field: keyof ProgressReview,
		value: string | number,
	) {
		setPayload((prev) => {
			if (!prev) return prev;
			const rows = prev.progressReviews.map((row, i) =>
				i === idx ? { ...row, [field]: value } : row,
			);
			return { ...prev, progressReviews: rows };
		});
	}

	function addReview() {
		setPayload((prev) =>
			prev
				? {
						...prev,
						progressReviews: [
							...prev.progressReviews,
							{ reviewDate: "", actionsCompletedPct: 0 },
						],
					}
				: prev,
		);
	}

	function removeReview(idx: number) {
		setPayload((prev) =>
			prev
				? {
						...prev,
						progressReviews: prev.progressReviews.filter((_, i) => i !== idx),
					}
				: prev,
		);
	}

	if (!payload) {
		return (
			<Frame>
				<FrameHeader>
					<FrameTitle>Corrective and Preventive Action (CAPA) Plan</FrameTitle>
					<FrameDescription>
						Generated automatically for the current Program and Term.
					</FrameDescription>
				</FrameHeader>
				<FramePanel>
					{!programId || !termId ? (
						<ContextRequired scope="program-term" />
					) : (
						<GeneratingState busy={loading || auto.busy} retry={auto.retry} />
					)}
				</FramePanel>
			</Frame>
		);
	}

	const editable = payload.status === "draft" || payload.status === "returned";

	return (
		<div className="space-y-6">
			<SubmissionStatusCard submissionId={payload.id} />

			<div className="border-border bg-muted/40 text-muted-foreground rounded-xl border p-4 text-sm">
				F27 is the structural fix owned by a senior leader. Submission is
				blocked server-side until the referenced{" "}
				<strong>Systemic Gap Report</strong> (F26) is approved. Maximum{" "}
				{MAX_ACTIONS} actions.
			</div>

			<Frame>
				<FrameHeader>
					<FrameTitle>Plan Information</FrameTitle>
					<FrameDescription>
						Which PLOs/cohorts the plan covers and who owns it.
					</FrameDescription>
				</FrameHeader>
				<FramePanel>
					<div className="grid grid-cols-3 gap-4">
						<Field>
							<FieldLabel>Program</FieldLabel>
							<Input
								value={payload.header.program ?? ""}
								onChange={(e) => updateHeader("program", e.target.value)}
							/>
						</Field>
						<Field>
							<FieldLabel>Referenced Systemic Gap Report (F26)</FieldLabel>
							<FormSelect
								value={payload.header.systemicGapReportId ?? ""}
								onValueChange={(v) => updateHeader("systemicGapReportId", v)}
								options={approvedGaps.map((gap) => ({
									value: gap.id,
									label: gap.label,
								}))}
								placeholder="Select an approved report…"
								disabled={approvedGaps.length === 0}
								className="w-full"
							/>
							{approvedGaps.length === 0 ? (
								<p className="text-muted-foreground mt-1 text-xs">
									No approved Systemic Gap Report for this program/term yet.
								</p>
							) : null}
						</Field>
						<Field>
							<FieldLabel>Senior Leader Owner</FieldLabel>
							<Input
								value={payload.header.seniorLeaderOwner ?? ""}
								onChange={(e) =>
									updateHeader("seniorLeaderOwner", e.target.value)
								}
							/>
						</Field>
					</div>
					<div className="mt-4 grid grid-cols-3 gap-4">
						<Field>
							<FieldLabel>PLO Codes (comma-separated)</FieldLabel>
							<Input
								value={joinList(payload.header.ploCodes)}
								onChange={(e) =>
									updateHeader("ploCodes", splitList(e.target.value))
								}
							/>
						</Field>
						<Field>
							<FieldLabel>Cohort Codes (comma-separated)</FieldLabel>
							<Input
								value={joinList(payload.header.cohortCodes)}
								onChange={(e) =>
									updateHeader("cohortCodes", splitList(e.target.value))
								}
							/>
						</Field>
						<Field>
							<FieldLabel>Aqau Monitoring Frequency</FieldLabel>
							<Input
								value={payload.header.aqauMonitoringFrequency ?? ""}
								onChange={(e) =>
									updateHeader("aqauMonitoringFrequency", e.target.value)
								}
							/>
						</Field>
					</div>
					<div className="mt-4 grid grid-cols-3 gap-4">
						<Field>
							<FieldLabel>Start Date</FieldLabel>
							<Input
								type="date"
								value={payload.header.startDate ?? ""}
								onChange={(e) => updateHeader("startDate", e.target.value)}
							/>
						</Field>
						<Field>
							<FieldLabel>Dean</FieldLabel>
							<Input
								value={payload.header.dean ?? ""}
								onChange={(e) => updateHeader("dean", e.target.value)}
							/>
						</Field>
						<Field>
							<FieldLabel>Expected Resolution AY</FieldLabel>
							<Input
								value={payload.header.expectedResolutionAy ?? ""}
								onChange={(e) =>
									updateHeader("expectedResolutionAy", e.target.value)
								}
							/>
						</Field>
					</div>
				</FramePanel>
			</Frame>

			<Frame>
				<FrameHeader>
					<FrameTitle>Corrective & Preventive Actions</FrameTitle>
					<FrameDescription>
						Binding action items — owner, deadline, and live progress.
					</FrameDescription>
				</FrameHeader>
				<FramePanel>
					<div className="overflow-x-auto">
						<table className="w-full text-sm">
							<thead className="border-b">
								<tr>
									<th className="px-3 py-2 text-left font-medium">Action</th>
									<th className="px-3 py-2 text-left font-medium">Type</th>
									<th className="px-3 py-2 text-left font-medium">Owner</th>
									<th className="px-3 py-2 text-left font-medium">
										Target Date
									</th>
									<th className="px-3 py-2 text-left font-medium">
										Progress %
									</th>
									<th className="px-3 py-2 text-left font-medium">
										Evidence URL
									</th>
									<th className="px-3 py-2 text-left font-medium"></th>
								</tr>
							</thead>
							<tbody>
								{payload.actions.map((row, idx) => (
									<tr key={idx} className="border-b">
										<td className="px-3 py-2">
											<Input
												className="min-w-60"
												value={row.description}
												onChange={(e) =>
													updateAction(idx, "description", e.target.value)
												}
											/>
										</td>
										<td className="px-3 py-2">
											<Input
												value={row.interventionType ?? ""}
												onChange={(e) =>
													updateAction(idx, "interventionType", e.target.value)
												}
											/>
										</td>
										<td className="px-3 py-2">
											<Input
												value={row.owner ?? ""}
												onChange={(e) =>
													updateAction(idx, "owner", e.target.value)
												}
											/>
										</td>
										<td className="px-3 py-2">
											<Input
												type="date"
												value={row.targetCompletionDate ?? ""}
												onChange={(e) =>
													updateAction(
														idx,
														"targetCompletionDate",
														e.target.value,
													)
												}
											/>
										</td>
										<td className="px-3 py-2">
											<Input
												type="number"
												min={0}
												max={100}
												value={row.progressPct ?? 0}
												onChange={(e) =>
													updateAction(
														idx,
														"progressPct",
														Number(e.target.value),
													)
												}
											/>
										</td>
										<td className="px-3 py-2">
											<Input
												value={row.evidenceUrl ?? ""}
												onChange={(e) =>
													updateAction(idx, "evidenceUrl", e.target.value)
												}
											/>
										</td>
										<td className="px-3 py-2">
											<Button variant="ghost" onClick={() => removeAction(idx)}>
												Remove
											</Button>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
					<div className="mt-3">
						<Button
							variant="outline"
							onClick={addAction}
							disabled={payload.actions.length >= MAX_ACTIONS}
						>
							Add Action
						</Button>
					</div>
				</FramePanel>
			</Frame>

			<Frame>
				<FrameHeader>
					<FrameTitle>AQAU Progress Reviews</FrameTitle>
					<FrameDescription>
						Monitoring checkpoints recorded against the plan.
					</FrameDescription>
				</FrameHeader>
				<FramePanel>
					<div className="overflow-x-auto">
						<table className="w-full text-sm">
							<thead className="border-b">
								<tr>
									<th className="px-3 py-2 text-left font-medium">
										Review Date
									</th>
									<th className="px-3 py-2 text-left font-medium">
										PLO Attainment %
									</th>
									<th className="px-3 py-2 text-left font-medium">Status</th>
									<th className="px-3 py-2 text-left font-medium">
										Actions Completed %
									</th>
									<th className="px-3 py-2 text-left font-medium">
										AQAU Notes
									</th>
									<th className="px-3 py-2 text-left font-medium"></th>
								</tr>
							</thead>
							<tbody>
								{payload.progressReviews.map((row, idx) => (
									<tr key={idx} className="border-b">
										<td className="px-3 py-2">
											<Input
												type="date"
												value={row.reviewDate}
												onChange={(e) =>
													updateReview(idx, "reviewDate", e.target.value)
												}
											/>
										</td>
										<td className="px-3 py-2">
											<Input
												type="number"
												min={0}
												max={100}
												value={row.ploAttainmentAtReview ?? ""}
												onChange={(e) =>
													updateReview(
														idx,
														"ploAttainmentAtReview",
														Number(e.target.value),
													)
												}
											/>
										</td>
										<td className="px-3 py-2">
											<Input
												value={row.status ?? ""}
												onChange={(e) =>
													updateReview(idx, "status", e.target.value)
												}
											/>
										</td>
										<td className="px-3 py-2">
											<Input
												type="number"
												min={0}
												max={100}
												value={row.actionsCompletedPct ?? 0}
												onChange={(e) =>
													updateReview(
														idx,
														"actionsCompletedPct",
														Number(e.target.value),
													)
												}
											/>
										</td>
										<td className="px-3 py-2">
											<Input
												className="min-w-50"
												value={row.aqauNotes ?? ""}
												onChange={(e) =>
													updateReview(idx, "aqauNotes", e.target.value)
												}
											/>
										</td>
										<td className="px-3 py-2">
											<Button variant="ghost" onClick={() => removeReview(idx)}>
												Remove
											</Button>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
					<div className="mt-3">
						<Button variant="outline" onClick={addReview}>
							Add Review
						</Button>
					</div>
				</FramePanel>
			</Frame>

			<Frame>
				<FrameHeader>
					<FrameTitle>Closure</FrameTitle>
					<FrameDescription>
						Declaration that the structural fix is sustained.
					</FrameDescription>
				</FrameHeader>
				<FramePanel>
					<div className="space-y-4">
						<Field>
							<FieldLabel>Closure Declaration</FieldLabel>
							<Textarea
								value={payload.closureDeclaration ?? ""}
								onChange={(e) =>
									setPayload((prev) =>
										prev
											? { ...prev, closureDeclaration: e.target.value }
											: prev,
									)
								}
							/>
						</Field>
						<Field className="max-w-xs">
							<FieldLabel>Benchmark-Sustained Cycles</FieldLabel>
							<Input
								type="number"
								min={0}
								value={payload.benchmarkSustainedCycles ?? 0}
								onChange={(e) =>
									setPayload((prev) =>
										prev
											? {
													...prev,
													benchmarkSustainedCycles: Number(e.target.value),
												}
											: prev,
									)
								}
							/>
						</Field>
					</div>
				</FramePanel>
			</Frame>

			<div className="flex items-center gap-3">
				<Button
					variant="outline"
					onClick={auto.retry}
					disabled={loading || auto.busy}
				>
					Re-generate
				</Button>
				<Button onClick={handleSave} disabled={saving || !editable}>
					{saving ? "Saving..." : "Save Changes"}
				</Button>
				{!editable ? (
					<p className="text-muted-foreground text-xs">
						Locked — editing is only allowed while the form is draft or
						returned.
					</p>
				) : null}
			</div>
		</div>
	);
}

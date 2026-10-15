"use client";

import { useAtomValue } from "jotai";
import { useCallback, useState } from "react";

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
	savePeriodicForm,
} from "@/server/actions/periodic";

const FORM_CODE: PeriodicFormCode = "institutional_review";

interface ProgramReviewRow {
	programCode: string;
	programName?: string;
	overallPloAttainmentPct?: number;
	ctlSubmitted?: boolean;
	aparComplete?: boolean;
	systemicGapReported?: boolean;
	priorityNotes?: string;
}

interface CqiCompletionRow {
	programCode: string;
	programName?: string;
	totalPlanned?: number;
	completed?: number;
	completionRatePct?: number;
	notes?: string;
}

interface Decisions {
	institutionalPriorities?: string;
	capaStatusUpdates?: string;
	resourceAllocations?: string;
	policyUpdates?: string;
	nonCompliantPrograms?: string;
}

interface Payload {
	id: string;
	status: string;
	header: {
		meetingDate?: string;
		venueMode?: string;
		presidedBy?: string;
		qaDirector?: string;
		deansPresent?: string[];
		deansAbsent?: string[];
	};
	programReviews: ProgramReviewRow[];
	cqiCompletions: CqiCompletionRow[];
	decisions: Decisions;
	signatures?: {
		qaDirector?: string;
		president?: string;
	};
}

const DECISION_FIELDS: Array<{ key: keyof Decisions; label: string }> = [
	{ key: "institutionalPriorities", label: "Institutional Priorities" },
	{ key: "capaStatusUpdates", label: "CAPA Status Updates" },
	{ key: "resourceAllocations", label: "Resource Allocations" },
	{ key: "policyUpdates", label: "Policy Updates" },
	{ key: "nonCompliantPrograms", label: "Non-Compliant Programs" },
];

function joinList(values?: string[]): string {
	return (values ?? []).join(", ");
}

function splitList(value: string): string[] {
	return value
		.split(",")
		.map((part) => part.trim())
		.filter(Boolean);
}

export default function InstitutionalReviewForm() {
	const [payload, setPayload] = useState<Payload | null>(null);
	const programId = useAtomValue(selectedProgramIdAtom);
	const termId = useAtomValue(selectedTermIdAtom);
	const [loading, setLoading] = useState(false);
	const [saving, setSaving] = useState(false);

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
				programReviews: payload.programReviews.map((row) => ({
					programCode: row.programCode,
					programName: row.programName ?? undefined,
					overallPloAttainmentPct: row.overallPloAttainmentPct,
					ctlSubmitted: row.ctlSubmitted ?? false,
					aparComplete: row.aparComplete ?? false,
					systemicGapReported: row.systemicGapReported ?? false,
					priorityNotes: row.priorityNotes ?? undefined,
				})),
				cqiCompletions: payload.cqiCompletions.map((row) => ({
					programCode: row.programCode,
					programName: row.programName ?? undefined,
					totalPlanned: row.totalPlanned,
					completed: row.completed,
					completionRatePct: row.completionRatePct,
					notes: row.notes ?? undefined,
				})),
				decisions: payload.decisions,
				signatures: payload.signatures,
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

	function updateHeader(field: string, value: string | string[] | undefined) {
		setPayload((prev) =>
			prev ? { ...prev, header: { ...prev.header, [field]: value } } : prev,
		);
	}

	function updateSignature(field: string, value: string) {
		setPayload((prev) =>
			prev
				? { ...prev, signatures: { ...prev.signatures, [field]: value } }
				: prev,
		);
	}

	function updateDecision(field: keyof Decisions, value: string) {
		setPayload((prev) =>
			prev
				? { ...prev, decisions: { ...prev.decisions, [field]: value } }
				: prev,
		);
	}

	function updateProgramReview(
		idx: number,
		field: keyof ProgramReviewRow,
		value: string | number | boolean,
	) {
		setPayload((prev) => {
			if (!prev) return prev;
			const rows = prev.programReviews.map((row, i) =>
				i === idx ? { ...row, [field]: value } : row,
			);
			return { ...prev, programReviews: rows };
		});
	}

	function addProgramReview() {
		setPayload((prev) =>
			prev
				? {
						...prev,
						programReviews: [...prev.programReviews, { programCode: "" }],
					}
				: prev,
		);
	}

	function removeProgramReview(idx: number) {
		setPayload((prev) =>
			prev
				? {
						...prev,
						programReviews: prev.programReviews.filter((_, i) => i !== idx),
					}
				: prev,
		);
	}

	function updateCqi(
		idx: number,
		field: keyof CqiCompletionRow,
		value: string | number,
	) {
		setPayload((prev) => {
			if (!prev) return prev;
			const rows = prev.cqiCompletions.map((row, i) =>
				i === idx ? { ...row, [field]: value } : row,
			);
			return { ...prev, cqiCompletions: rows };
		});
	}

	function addCqi() {
		setPayload((prev) =>
			prev
				? {
						...prev,
						cqiCompletions: [...prev.cqiCompletions, { programCode: "" }],
					}
				: prev,
		);
	}

	function removeCqi(idx: number) {
		setPayload((prev) =>
			prev
				? {
						...prev,
						cqiCompletions: prev.cqiCompletions.filter((_, i) => i !== idx),
					}
				: prev,
		);
	}

	if (!payload) {
		return (
			<Frame>
				<FrameHeader>
					<FrameTitle>Institutional Management Review Records</FrameTitle>
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

			<Frame>
				<FrameHeader>
					<FrameTitle>Meeting Information</FrameTitle>
					<FrameDescription>
						The annual institutional review — AQAU prepares, the VPAA presides.
					</FrameDescription>
				</FrameHeader>
				<FramePanel>
					<div className="grid grid-cols-4 gap-4">
						<Field>
							<FieldLabel>Meeting Date</FieldLabel>
							<Input
								type="date"
								value={payload.header.meetingDate ?? ""}
								onChange={(e) => updateHeader("meetingDate", e.target.value)}
							/>
						</Field>
						<Field>
							<FieldLabel>Venue / Mode</FieldLabel>
							<Input
								value={payload.header.venueMode ?? ""}
								onChange={(e) => updateHeader("venueMode", e.target.value)}
							/>
						</Field>
						<Field>
							<FieldLabel>Presided By</FieldLabel>
							<Input
								value={payload.header.presidedBy ?? ""}
								onChange={(e) => updateHeader("presidedBy", e.target.value)}
							/>
						</Field>
						<Field>
							<FieldLabel>QA Director</FieldLabel>
							<Input
								value={payload.header.qaDirector ?? ""}
								onChange={(e) => updateHeader("qaDirector", e.target.value)}
							/>
						</Field>
					</div>
					<div className="mt-4 grid grid-cols-2 gap-4">
						<Field>
							<FieldLabel>Deans Present (comma-separated)</FieldLabel>
							<Input
								value={joinList(payload.header.deansPresent)}
								onChange={(e) =>
									updateHeader("deansPresent", splitList(e.target.value))
								}
							/>
						</Field>
						<Field>
							<FieldLabel>Deans Absent (comma-separated)</FieldLabel>
							<Input
								value={joinList(payload.header.deansAbsent)}
								onChange={(e) =>
									updateHeader("deansAbsent", splitList(e.target.value))
								}
							/>
						</Field>
					</div>
				</FramePanel>
			</Frame>

			<Frame>
				<FrameHeader>
					<FrameTitle>Program Reviews</FrameTitle>
					<FrameDescription>
						Per-program compliance across the assessed year.
					</FrameDescription>
				</FrameHeader>
				<FramePanel>
					<div className="overflow-x-auto">
						<table className="w-full text-sm">
							<thead className="border-b">
								<tr>
									<th className="px-3 py-2 text-left font-medium">Program</th>
									<th className="px-3 py-2 text-left font-medium">Name</th>
									<th className="px-3 py-2 text-left font-medium">
										PLO Attainment %
									</th>
									<th className="px-3 py-2 text-left font-medium">CTL</th>
									<th className="px-3 py-2 text-left font-medium">APAR</th>
									<th className="px-3 py-2 text-left font-medium">Sys. Gap</th>
									<th className="px-3 py-2 text-left font-medium">Notes</th>
									<th className="px-3 py-2 text-left font-medium"></th>
								</tr>
							</thead>
							<tbody>
								{payload.programReviews.map((row, idx) => (
									<tr key={idx} className="border-b">
										<td className="px-3 py-2">
											<Input
												value={row.programCode}
												onChange={(e) =>
													updateProgramReview(
														idx,
														"programCode",
														e.target.value,
													)
												}
											/>
										</td>
										<td className="px-3 py-2">
											<Input
												value={row.programName ?? ""}
												onChange={(e) =>
													updateProgramReview(
														idx,
														"programName",
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
												value={row.overallPloAttainmentPct ?? ""}
												onChange={(e) =>
													updateProgramReview(
														idx,
														"overallPloAttainmentPct",
														Number(e.target.value),
													)
												}
											/>
										</td>
										<td className="px-3 py-2">
											<input
												type="checkbox"
												checked={row.ctlSubmitted ?? false}
												onChange={(e) =>
													updateProgramReview(
														idx,
														"ctlSubmitted",
														e.target.checked,
													)
												}
												className="border-input rounded"
											/>
										</td>
										<td className="px-3 py-2">
											<input
												type="checkbox"
												checked={row.aparComplete ?? false}
												onChange={(e) =>
													updateProgramReview(
														idx,
														"aparComplete",
														e.target.checked,
													)
												}
												className="border-input rounded"
											/>
										</td>
										<td className="px-3 py-2">
											<input
												type="checkbox"
												checked={row.systemicGapReported ?? false}
												onChange={(e) =>
													updateProgramReview(
														idx,
														"systemicGapReported",
														e.target.checked,
													)
												}
												className="border-input rounded"
											/>
										</td>
										<td className="px-3 py-2">
											<Input
												className="min-w-50"
												value={row.priorityNotes ?? ""}
												onChange={(e) =>
													updateProgramReview(
														idx,
														"priorityNotes",
														e.target.value,
													)
												}
											/>
										</td>
										<td className="px-3 py-2">
											<Button
												variant="ghost"
												onClick={() => removeProgramReview(idx)}
											>
												Remove
											</Button>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
					<div className="mt-3">
						<Button variant="outline" onClick={addProgramReview}>
							Add Program
						</Button>
					</div>
				</FramePanel>
			</Frame>

			<Frame>
				<FrameHeader>
					<FrameTitle>CQI Completion by Program</FrameTitle>
					<FrameDescription>
						Planned vs completed CQI actions — the institutional ≥70% completion
						check.
					</FrameDescription>
				</FrameHeader>
				<FramePanel>
					<div className="overflow-x-auto">
						<table className="w-full text-sm">
							<thead className="border-b">
								<tr>
									<th className="px-3 py-2 text-left font-medium">Program</th>
									<th className="px-3 py-2 text-left font-medium">Name</th>
									<th className="px-3 py-2 text-left font-medium">Planned</th>
									<th className="px-3 py-2 text-left font-medium">Completed</th>
									<th className="px-3 py-2 text-left font-medium">Rate %</th>
									<th className="px-3 py-2 text-left font-medium">Notes</th>
									<th className="px-3 py-2 text-left font-medium"></th>
								</tr>
							</thead>
							<tbody>
								{payload.cqiCompletions.map((row, idx) => (
									<tr key={idx} className="border-b">
										<td className="px-3 py-2">
											<Input
												value={row.programCode}
												onChange={(e) =>
													updateCqi(idx, "programCode", e.target.value)
												}
											/>
										</td>
										<td className="px-3 py-2">
											<Input
												value={row.programName ?? ""}
												onChange={(e) =>
													updateCqi(idx, "programName", e.target.value)
												}
											/>
										</td>
										<td className="px-3 py-2">
											<Input
												type="number"
												min={0}
												value={row.totalPlanned ?? ""}
												onChange={(e) =>
													updateCqi(idx, "totalPlanned", Number(e.target.value))
												}
											/>
										</td>
										<td className="px-3 py-2">
											<Input
												type="number"
												min={0}
												value={row.completed ?? ""}
												onChange={(e) =>
													updateCqi(idx, "completed", Number(e.target.value))
												}
											/>
										</td>
										<td className="px-3 py-2">
											<Input
												type="number"
												min={0}
												max={100}
												value={row.completionRatePct ?? ""}
												onChange={(e) =>
													updateCqi(
														idx,
														"completionRatePct",
														Number(e.target.value),
													)
												}
											/>
										</td>
										<td className="px-3 py-2">
											<Input
												className="min-w-50"
												value={row.notes ?? ""}
												onChange={(e) =>
													updateCqi(idx, "notes", e.target.value)
												}
											/>
										</td>
										<td className="px-3 py-2">
											<Button variant="ghost" onClick={() => removeCqi(idx)}>
												Remove
											</Button>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
					<div className="mt-3">
						<Button variant="outline" onClick={addCqi}>
							Add Program
						</Button>
					</div>
				</FramePanel>
			</Frame>

			<Frame>
				<FrameHeader>
					<FrameTitle>Decisions</FrameTitle>
					<FrameDescription>
						The review's recorded decisions, forwarded to the President.
					</FrameDescription>
				</FrameHeader>
				<FramePanel>
					<div className="space-y-4">
						{DECISION_FIELDS.map(({ key, label }) => (
							<Field key={key}>
								<FieldLabel>{label}</FieldLabel>
								<Textarea
									value={payload.decisions[key] ?? ""}
									onChange={(e) => updateDecision(key, e.target.value)}
								/>
							</Field>
						))}
					</div>
				</FramePanel>
			</Frame>

			<Frame>
				<FrameHeader>
					<FrameTitle>Signatures</FrameTitle>
					<FrameDescription>
						Printed names for the QA Director and President signatures.
					</FrameDescription>
				</FrameHeader>
				<FramePanel>
					<div className="grid grid-cols-2 gap-4">
						<Field>
							<FieldLabel>QA Director</FieldLabel>
							<Input
								value={payload.signatures?.qaDirector ?? ""}
								onChange={(e) => updateSignature("qaDirector", e.target.value)}
							/>
						</Field>
						<Field>
							<FieldLabel>President</FieldLabel>
							<Input
								value={payload.signatures?.president ?? ""}
								onChange={(e) => updateSignature("president", e.target.value)}
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

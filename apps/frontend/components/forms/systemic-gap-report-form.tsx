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
import { FormSelect } from "@/components/ui/form-select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast, toastError } from "@/components/ui/toast";
import { ROOT_CAUSES } from "@/lib/constants/obe";
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

const FORM_CODE: PeriodicFormCode = "systemic_gap_report";

/** The manual's fixed 6 root-cause categories. */
const ROOT_CAUSE_OPTIONS = ROOT_CAUSES.map((value) => ({
	value,
	label: value,
}));

/**
 * Cycle status is free text on the backend (`SystemicGapCycleRowSchema`);
 * offered as a MET / below-benchmark toggle to match the OBE vocabulary.
 */
const CYCLE_STATUS_OPTIONS = [
	{ value: "not_met", label: "NOT MET" },
	{ value: "met", label: "MET" },
];

interface CycleRow {
	ayCycle: string;
	ploAttainmentPct: number;
	cohort?: string;
	benchmarkPct?: number;
	status?: string;
	interventionsImplemented?: string;
}

interface Payload {
	id: string;
	status: string;
	header: {
		program?: string;
		dean?: string;
		programChair?: string;
		ploCodesWithGap?: string[];
		yearLevelCohorts?: string[];
		cycleCountBelowBenchmark?: number;
		ayFirstFailure?: string;
		aySecondFailure?: string;
		ayThirdFailure?: string;
		dateTriggerIdentified?: string;
		dueDate?: string;
	};
	cycleRows: CycleRow[];
	evidenceNarrative?: string | null;
	rootCauseCategory?: string | null;
	rootCauseAnalysis?: string | null;
	recommendedStructuralResponse?: string | null;
	capaPlanOutline?: string | null;
	signatures?: {
		dean?: string;
		pacChair?: string;
		vpaa?: string;
	};
}

/** Comma-separated list ⇄ string[] (the schema stores arrays of codes). */
function joinList(values?: string[]): string {
	return (values ?? []).join(", ");
}

function splitList(value: string): string[] {
	return value
		.split(",")
		.map((part) => part.trim())
		.filter(Boolean);
}

export default function SystemicGapReportForm() {
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
				cycleRows: payload.cycleRows.map((row) => ({
					ayCycle: row.ayCycle,
					ploAttainmentPct: row.ploAttainmentPct,
					cohort: row.cohort ?? undefined,
					benchmarkPct: row.benchmarkPct,
					status: row.status ?? undefined,
					interventionsImplemented: row.interventionsImplemented ?? undefined,
				})),
				evidenceNarrative: payload.evidenceNarrative ?? undefined,
				rootCauseCategory: payload.rootCauseCategory ?? undefined,
				rootCauseAnalysis: payload.rootCauseAnalysis ?? undefined,
				recommendedStructuralResponse:
					payload.recommendedStructuralResponse ?? undefined,
				capaPlanOutline: payload.capaPlanOutline ?? undefined,
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

	function updateHeader(
		field: string,
		value: string | number | string[] | undefined,
	) {
		setPayload((prev) =>
			prev ? { ...prev, header: { ...prev.header, [field]: value } } : prev,
		);
	}

	function updateField(field: keyof Payload, value: string) {
		setPayload((prev) => (prev ? { ...prev, [field]: value } : prev));
	}

	function updateSignature(field: string, value: string) {
		setPayload((prev) =>
			prev
				? { ...prev, signatures: { ...prev.signatures, [field]: value } }
				: prev,
		);
	}

	function updateCycle(
		idx: number,
		field: keyof CycleRow,
		value: string | number,
	) {
		setPayload((prev) => {
			if (!prev) return prev;
			const rows = prev.cycleRows.map((row, i) =>
				i === idx ? { ...row, [field]: value } : row,
			);
			return { ...prev, cycleRows: rows };
		});
	}

	function addCycle() {
		setPayload((prev) =>
			prev
				? {
						...prev,
						cycleRows: [
							...prev.cycleRows,
							{
								ayCycle: "",
								ploAttainmentPct: 0,
								benchmarkPct: 70,
								status: "not_met",
							},
						],
					}
				: prev,
		);
	}

	function removeCycle(idx: number) {
		setPayload((prev) =>
			prev
				? { ...prev, cycleRows: prev.cycleRows.filter((_, i) => i !== idx) }
				: prev,
		);
	}

	if (!payload) {
		return (
			<Frame>
				<FrameHeader>
					<FrameTitle>Systemic Gap Report</FrameTitle>
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
				F26 is filed only after a PLO–cohort combination fails the ≥70%
				benchmark for <strong>3 consecutive cycles</strong>. Submission is
				blocked server-side until the Cohort Tracking Sheet shows that evidence.
			</div>

			<Frame>
				<FrameHeader>
					<FrameTitle>Identification</FrameTitle>
					<FrameDescription>
						Which PLOs and cohorts triggered this systemic review.
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
							<FieldLabel>Dean</FieldLabel>
							<Input
								value={payload.header.dean ?? ""}
								onChange={(e) => updateHeader("dean", e.target.value)}
							/>
						</Field>
						<Field>
							<FieldLabel>Program Chair</FieldLabel>
							<Input
								value={payload.header.programChair ?? ""}
								onChange={(e) => updateHeader("programChair", e.target.value)}
							/>
						</Field>
					</div>
					<div className="mt-4 grid grid-cols-3 gap-4">
						<Field>
							<FieldLabel>PLO Codes with Gap (comma-separated)</FieldLabel>
							<Input
								value={joinList(payload.header.ploCodesWithGap)}
								onChange={(e) =>
									updateHeader("ploCodesWithGap", splitList(e.target.value))
								}
							/>
						</Field>
						<Field>
							<FieldLabel>Year-Level Cohorts (comma-separated)</FieldLabel>
							<Input
								value={joinList(payload.header.yearLevelCohorts)}
								onChange={(e) =>
									updateHeader("yearLevelCohorts", splitList(e.target.value))
								}
							/>
						</Field>
						<Field>
							<FieldLabel>Cycles Below Benchmark</FieldLabel>
							<Input
								type="number"
								min={0}
								value={payload.header.cycleCountBelowBenchmark ?? ""}
								onChange={(e) =>
									updateHeader(
										"cycleCountBelowBenchmark",
										e.target.value === "" ? undefined : Number(e.target.value),
									)
								}
							/>
						</Field>
					</div>
					<div className="mt-4 grid grid-cols-3 gap-4">
						<Field>
							<FieldLabel>AY — 1st Failure</FieldLabel>
							<Input
								value={payload.header.ayFirstFailure ?? ""}
								onChange={(e) => updateHeader("ayFirstFailure", e.target.value)}
							/>
						</Field>
						<Field>
							<FieldLabel>AY — 2nd Failure</FieldLabel>
							<Input
								value={payload.header.aySecondFailure ?? ""}
								onChange={(e) =>
									updateHeader("aySecondFailure", e.target.value)
								}
							/>
						</Field>
						<Field>
							<FieldLabel>AY — 3rd Failure</FieldLabel>
							<Input
								value={payload.header.ayThirdFailure ?? ""}
								onChange={(e) => updateHeader("ayThirdFailure", e.target.value)}
							/>
						</Field>
					</div>
					<div className="mt-4 grid grid-cols-3 gap-4">
						<Field>
							<FieldLabel>Date Trigger Identified</FieldLabel>
							<Input
								type="date"
								value={payload.header.dateTriggerIdentified ?? ""}
								onChange={(e) =>
									updateHeader("dateTriggerIdentified", e.target.value)
								}
							/>
						</Field>
						<Field>
							<FieldLabel>Due Date</FieldLabel>
							<Input
								type="date"
								value={payload.header.dueDate ?? ""}
								onChange={(e) => updateHeader("dueDate", e.target.value)}
							/>
						</Field>
					</div>
				</FramePanel>
			</Frame>

			<Frame>
				<FrameHeader>
					<FrameTitle>3-Cycle Evidence</FrameTitle>
					<FrameDescription>
						The consecutive failures that justify a systemic response.
					</FrameDescription>
				</FrameHeader>
				<FramePanel>
					<div className="overflow-x-auto">
						<table className="w-full text-sm">
							<thead className="border-b">
								<tr>
									<th className="px-3 py-2 text-left font-medium">AY Cycle</th>
									<th className="px-3 py-2 text-left font-medium">
										Attainment %
									</th>
									<th className="px-3 py-2 text-left font-medium">Cohort</th>
									<th className="px-3 py-2 text-left font-medium">
										Benchmark %
									</th>
									<th className="px-3 py-2 text-left font-medium">Status</th>
									<th className="px-3 py-2 text-left font-medium">
										Interventions Implemented
									</th>
									<th className="px-3 py-2 text-left font-medium"></th>
								</tr>
							</thead>
							<tbody>
								{payload.cycleRows.map((row, idx) => (
									<tr key={idx} className="border-b">
										<td className="px-3 py-2">
											<Input
												value={row.ayCycle}
												onChange={(e) =>
													updateCycle(idx, "ayCycle", e.target.value)
												}
											/>
										</td>
										<td className="px-3 py-2">
											<Input
												type="number"
												min={0}
												max={100}
												value={row.ploAttainmentPct}
												onChange={(e) =>
													updateCycle(
														idx,
														"ploAttainmentPct",
														Number(e.target.value),
													)
												}
											/>
										</td>
										<td className="px-3 py-2">
											<Input
												value={row.cohort ?? ""}
												onChange={(e) =>
													updateCycle(idx, "cohort", e.target.value)
												}
											/>
										</td>
										<td className="px-3 py-2">
											<Input
												type="number"
												min={0}
												max={100}
												value={row.benchmarkPct ?? ""}
												onChange={(e) =>
													updateCycle(
														idx,
														"benchmarkPct",
														e.target.value === "" ? 0 : Number(e.target.value),
													)
												}
											/>
										</td>
										<td className="px-3 py-2">
											<FormSelect
												value={row.status ?? "not_met"}
												onValueChange={(v) => updateCycle(idx, "status", v)}
												options={CYCLE_STATUS_OPTIONS}
												className="w-full"
											/>
										</td>
										<td className="px-3 py-2">
											<Input
												className="min-w-60"
												value={row.interventionsImplemented ?? ""}
												onChange={(e) =>
													updateCycle(
														idx,
														"interventionsImplemented",
														e.target.value,
													)
												}
											/>
										</td>
										<td className="px-3 py-2">
											<Button variant="ghost" onClick={() => removeCycle(idx)}>
												Remove
											</Button>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
					<div className="mt-3">
						<Button variant="outline" onClick={addCycle}>
							Add Cycle Row
						</Button>
					</div>
				</FramePanel>
			</Frame>

			<Frame>
				<FrameHeader>
					<FrameTitle>Root Cause & Structural Response</FrameTitle>
					<FrameDescription>
						The accredited root cause and the structural fix this report
						recommends.
					</FrameDescription>
				</FrameHeader>
				<FramePanel>
					<div className="space-y-4">
						<Field>
							<FieldLabel>Evidence Narrative</FieldLabel>
							<Textarea
								value={payload.evidenceNarrative ?? ""}
								onChange={(e) =>
									updateField("evidenceNarrative", e.target.value)
								}
							/>
						</Field>
						<Field>
							<FieldLabel>Root Cause Category</FieldLabel>
							<FormSelect
								value={payload.rootCauseCategory ?? ""}
								onValueChange={(v) => updateField("rootCauseCategory", v)}
								options={ROOT_CAUSE_OPTIONS}
								className="w-full"
							/>
						</Field>
						<Field>
							<FieldLabel>Root Cause Analysis</FieldLabel>
							<Textarea
								value={payload.rootCauseAnalysis ?? ""}
								onChange={(e) =>
									updateField("rootCauseAnalysis", e.target.value)
								}
							/>
						</Field>
						<Field>
							<FieldLabel>Recommended Structural Response</FieldLabel>
							<Textarea
								value={payload.recommendedStructuralResponse ?? ""}
								onChange={(e) =>
									updateField("recommendedStructuralResponse", e.target.value)
								}
							/>
						</Field>
						<Field>
							<FieldLabel>CAPA Plan Outline</FieldLabel>
							<Textarea
								value={payload.capaPlanOutline ?? ""}
								onChange={(e) => updateField("capaPlanOutline", e.target.value)}
							/>
						</Field>
					</div>
				</FramePanel>
			</Frame>

			<Frame>
				<FrameHeader>
					<FrameTitle>Signatures</FrameTitle>
					<FrameDescription>
						Printed names for the offline signatures the manual requires.
					</FrameDescription>
				</FrameHeader>
				<FramePanel>
					<div className="grid grid-cols-3 gap-4">
						<Field>
							<FieldLabel>Dean</FieldLabel>
							<Input
								value={payload.signatures?.dean ?? ""}
								onChange={(e) => updateSignature("dean", e.target.value)}
							/>
						</Field>
						<Field>
							<FieldLabel>PAC Chair</FieldLabel>
							<Input
								value={payload.signatures?.pacChair ?? ""}
								onChange={(e) => updateSignature("pacChair", e.target.value)}
							/>
						</Field>
						<Field>
							<FieldLabel>VPAA</FieldLabel>
							<Input
								value={payload.signatures?.vpaa ?? ""}
								onChange={(e) => updateSignature("vpaa", e.target.value)}
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

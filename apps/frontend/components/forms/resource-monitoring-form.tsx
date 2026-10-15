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

const FORM_CODE: PeriodicFormCode = "resource_monitoring";

// NOTE: mirrors the backend enums (01-enums.prisma) — PdcaPhase / AcquisitionStatus.
const PHASE_OPTIONS = [
	{ value: "plan", label: "PLAN" },
	{ value: "do", label: "DO" },
	{ value: "check", label: "CHECK" },
	{ value: "act", label: "ACT" },
];

const ACQUISITION_OPTIONS = [
	{ value: "acquired", label: "Acquired" },
	{ value: "pending", label: "Pending" },
	{ value: "not_acquired", label: "Not Acquired" },
	{ value: "na", label: "N/A" },
];

/** CqiImplementationStatus. */
const IMPLEMENTATION_OPTIONS = [
	{ value: "fully", label: "Fully Implemented" },
	{ value: "partially", label: "Partially Implemented" },
	{ value: "not_yet", label: "Not Yet" },
];

interface ResourceItemRow {
	id?: string;
	budgetLineItemId?: string | null;
	name: string;
	phase: string;
	acquisitionStatus: string;
	/** The input schema's field name; the DB column is `notes` (mapped on load). */
	remarks?: string | null;
}

interface CqiImplementRow {
	id?: string;
	cqiEntryId?: string | null;
	interventionDescription: string;
	implementationStatus: string;
	evidenceNotes?: string | null;
}

interface Payload {
	id: string;
	status: string;
	header: {
		program?: string;
		dean?: string;
		academicYear?: string;
		reportCovers?: string;
		dateSubmitted?: string;
	};
	/** DB rows come back with `notes`; remapped to `remarks` on load. */
	resourceItems: Array<{
		id: string;
		budgetLineItemId?: string | null;
		name: string;
		phase: string;
		acquisitionStatus: string;
		notes?: string | null;
	}>;
	cqiImplementRows: CqiImplementRow[];
}

/** DB row → editor row (`notes` → `remarks`, null → ""). */
function toEditorRow(row: Payload["resourceItems"][number]): ResourceItemRow {
	return {
		id: row.id,
		budgetLineItemId: row.budgetLineItemId,
		name: row.name,
		phase: row.phase,
		acquisitionStatus: row.acquisitionStatus,
		remarks: row.notes ?? "",
	};
}

export default function ResourceMonitoringForm() {
	const [payload, setPayload] = useState<Payload | null>(null);
	const [items, setItems] = useState<ResourceItemRow[]>([]);
	const programId = useAtomValue(selectedProgramIdAtom);
	const termId = useAtomValue(selectedTermIdAtom);
	const [loading, setLoading] = useState(false);
	const [saving, setSaving] = useState(false);

	const applyPayload = useCallback((next: Payload) => {
		setPayload(next);
		setItems(next.resourceItems.map(toEditorRow));
	}, []);

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
					applyPayload(payloadResult.data);
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
	}, [programId, termId, applyPayload]);

	const auto = useAutoGenerate([programId, termId], handleInit);

	const handleSave = useCallback(async () => {
		if (!payload) return;
		setSaving(true);
		try {
			const result = await savePeriodicForm<Payload>(FORM_CODE, payload.id, {
				header: payload.header,
				resourceItems: items.map((row) => ({
					id: row.id,
					budgetLineItemId: row.budgetLineItemId ?? undefined,
					name: row.name,
					phase: row.phase,
					acquisitionStatus: row.acquisitionStatus,
					remarks: row.remarks ?? undefined,
				})),
				cqiImplementRows: payload.cqiImplementRows.map((row) => ({
					id: row.id,
					cqiEntryId: row.cqiEntryId ?? undefined,
					interventionDescription: row.interventionDescription,
					implementationStatus: row.implementationStatus,
					evidenceNotes: row.evidenceNotes ?? undefined,
				})),
			});
			if (result.ok) {
				applyPayload(result.data);
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
	}, [payload, items, applyPayload]);

	function updateHeader(field: string, value: string) {
		setPayload((prev) =>
			prev ? { ...prev, header: { ...prev.header, [field]: value } } : prev,
		);
	}

	function updateItem(
		idx: number,
		field: keyof ResourceItemRow,
		value: string,
	) {
		setItems((prev) =>
			prev.map((row, i) => (i === idx ? { ...row, [field]: value } : row)),
		);
	}

	function addItem() {
		setItems((prev) => [
			...prev,
			{ name: "", phase: "do", acquisitionStatus: "pending", remarks: "" },
		]);
	}

	function removeItem(idx: number) {
		setItems((prev) => prev.filter((_, i) => i !== idx));
	}

	function updateCqi(idx: number, field: keyof CqiImplementRow, value: string) {
		setPayload((prev) => {
			if (!prev) return prev;
			const rows = prev.cqiImplementRows.map((row, i) =>
				i === idx ? { ...row, [field]: value } : row,
			);
			return { ...prev, cqiImplementRows: rows };
		});
	}

	function addCqiRow() {
		setPayload((prev) =>
			prev
				? {
						...prev,
						cqiImplementRows: [
							...prev.cqiImplementRows,
							{
								interventionDescription: "",
								implementationStatus: "not_yet",
								evidenceNotes: "",
							},
						],
					}
				: prev,
		);
	}

	function removeCqiRow(idx: number) {
		setPayload((prev) =>
			prev
				? {
						...prev,
						cqiImplementRows: prev.cqiImplementRows.filter((_, i) => i !== idx),
					}
				: prev,
		);
	}

	if (!payload) {
		return (
			<Frame>
				<FrameHeader>
					<FrameTitle>
						Resource Acquisition and Implementation Monitoring
					</FrameTitle>
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
					<FrameTitle>Report Information</FrameTitle>
					<FrameDescription>
						Who filed this report and what period it covers.
					</FrameDescription>
				</FrameHeader>
				<FramePanel>
					<div className="grid grid-cols-4 gap-4">
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
							<FieldLabel>Academic Year</FieldLabel>
							<Input
								value={payload.header.academicYear ?? ""}
								onChange={(e) => updateHeader("academicYear", e.target.value)}
							/>
						</Field>
						<Field>
							<FieldLabel>Date Submitted</FieldLabel>
							<Input
								type="date"
								value={payload.header.dateSubmitted ?? ""}
								onChange={(e) => updateHeader("dateSubmitted", e.target.value)}
							/>
						</Field>
					</div>
					<div className="mt-4">
						<Field>
							<FieldLabel>Report Covers</FieldLabel>
							<Textarea
								value={payload.header.reportCovers ?? ""}
								onChange={(e) => updateHeader("reportCovers", e.target.value)}
							/>
						</Field>
					</div>
				</FramePanel>
			</Frame>

			<Frame>
				<FrameHeader>
					<FrameTitle>Resource Acquisition</FrameTitle>
					<FrameDescription>
						Resources requested by PDCA phase, with acquisition status.
					</FrameDescription>
				</FrameHeader>
				<FramePanel>
					<div className="overflow-x-auto">
						<table className="w-full text-sm">
							<thead className="border-b">
								<tr>
									<th className="px-3 py-2 text-left font-medium">Resource</th>
									<th className="px-3 py-2 text-left font-medium">Phase</th>
									<th className="px-3 py-2 text-left font-medium">Status</th>
									<th className="px-3 py-2 text-left font-medium">Remarks</th>
									<th className="px-3 py-2 text-left font-medium"></th>
								</tr>
							</thead>
							<tbody>
								{items.map((row, idx) => (
									<tr key={idx} className="border-b">
										<td className="px-3 py-2">
											<Input
												className="min-w-50"
												value={row.name}
												onChange={(e) =>
													updateItem(idx, "name", e.target.value)
												}
											/>
										</td>
										<td className="px-3 py-2">
											<FormSelect
												value={row.phase}
												onValueChange={(v) => updateItem(idx, "phase", v)}
												options={PHASE_OPTIONS}
												className="w-full"
											/>
										</td>
										<td className="px-3 py-2">
											<FormSelect
												value={row.acquisitionStatus}
												onValueChange={(v) =>
													updateItem(idx, "acquisitionStatus", v)
												}
												options={ACQUISITION_OPTIONS}
												className="w-full"
											/>
										</td>
										<td className="px-3 py-2">
											<Input
												className="min-w-50"
												value={row.remarks ?? ""}
												onChange={(e) =>
													updateItem(idx, "remarks", e.target.value)
												}
											/>
										</td>
										<td className="px-3 py-2">
											<Button variant="ghost" onClick={() => removeItem(idx)}>
												Remove
											</Button>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
					<div className="mt-3">
						<Button variant="outline" onClick={addItem}>
							Add Resource
						</Button>
					</div>
				</FramePanel>
			</Frame>

			<Frame>
				<FrameHeader>
					<FrameTitle>CQI Implementation Tracking</FrameTitle>
					<FrameDescription>
						Implementation status of the CQI actions this cycle.
					</FrameDescription>
				</FrameHeader>
				<FramePanel>
					<div className="overflow-x-auto">
						<table className="w-full text-sm">
							<thead className="border-b">
								<tr>
									<th className="px-3 py-2 text-left font-medium">
										Intervention
									</th>
									<th className="px-3 py-2 text-left font-medium">Status</th>
									<th className="px-3 py-2 text-left font-medium">Evidence</th>
									<th className="px-3 py-2 text-left font-medium"></th>
								</tr>
							</thead>
							<tbody>
								{payload.cqiImplementRows.map((row, idx) => (
									<tr key={idx} className="border-b">
										<td className="px-3 py-2">
											<Input
												className="min-w-60"
												value={row.interventionDescription}
												onChange={(e) =>
													updateCqi(
														idx,
														"interventionDescription",
														e.target.value,
													)
												}
											/>
										</td>
										<td className="px-3 py-2">
											<FormSelect
												value={row.implementationStatus}
												onValueChange={(v) =>
													updateCqi(idx, "implementationStatus", v)
												}
												options={IMPLEMENTATION_OPTIONS}
												className="w-full"
											/>
										</td>
										<td className="px-3 py-2">
											<Input
												className="min-w-50"
												value={row.evidenceNotes ?? ""}
												onChange={(e) =>
													updateCqi(idx, "evidenceNotes", e.target.value)
												}
											/>
										</td>
										<td className="px-3 py-2">
											<Button variant="ghost" onClick={() => removeCqiRow(idx)}>
												Remove
											</Button>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
					<div className="mt-3">
						<Button variant="outline" onClick={addCqiRow}>
							Add Row
						</Button>
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

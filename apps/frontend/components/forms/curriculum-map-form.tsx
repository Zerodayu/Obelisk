"use client";

import { useAtomValue } from "jotai";
import { useCallback, useState } from "react";

import { ContextRequired } from "@/components/forms/context-required";
import { GeneratingState } from "@/components/forms/generating";
import { SubmissionStatusCard } from "@/components/forms/submission-status-card";
import { Badge } from "@/components/reui/badge";
import {
	Frame,
	FrameDescription,
	FrameHeader,
	FramePanel,
	FrameTitle,
} from "@/components/reui/frame";
import { Button } from "@/components/ui/button";
import { toast, toastError } from "@/components/ui/toast";
import { useAutoGenerate } from "@/lib/hooks/use-auto-generate";
import {
	selectedProgramIdAtom,
	selectedTermIdAtom,
} from "@/lib/store/atoms/academic";
import { initCurriculumMap, saveCurriculumMap } from "@/server/actions/plan";

import { CloPloMapPanel } from "./clo-plo-map-panel";

interface PloDirectoryRow {
	ploCode: string;
	statement: string;
	evidenceSources: string[];
	dStageCourse: string;
	validationStatus: string;
}

interface CurriculumCourseRow {
	yearLevel: number;
	courseCode: string;
	courseTitle: string;
	cells: {
		ploCode: string;
		stage: string | null;
		cloCodes: string[];
	}[];
}

interface CurriculumMapPayload {
	formSubmissionId: string;
	generatedAt: string;
	header: Record<string, unknown>;
	directoryRows: PloDirectoryRow[];
	courseRows: CurriculumCourseRow[];
	coverageCheck: Record<string, boolean>;
}

const STAGES = ["i", "p", "d"] as const;

export function CurriculumMapForm() {
	const [payload, setPayload] = useState<CurriculumMapPayload | null>(null);
	const [plos, setPlos] = useState<PloDirectoryRow[]>([]);
	const [courses, setCourses] = useState<CurriculumCourseRow[]>([]);
	// NOTE: academic context comes from the dashboard picker, not local state.
	const programId = useAtomValue(selectedProgramIdAtom);
	const termId = useAtomValue(selectedTermIdAtom);
	const [loading, setLoading] = useState(false);
	const [saving, setSaving] = useState(false);

	const handleGenerate = useCallback(async () => {
		if (!programId.trim() || !termId.trim()) return;
		setLoading(true);
		try {
			const result = await initCurriculumMap({
				programId: programId.trim(),
				termId: termId.trim(),
			});
			if (result.ok) {
				const p = result.data.payload as unknown as CurriculumMapPayload;
				setPayload(p);
				setPlos(p.directoryRows || []);
				setCourses(p.courseRows || []);
				toast.create({ title: "Curriculum map initialized", type: "success" });
			} else {
				toastError({
					title: "Init failed",
					description: result.error,
					scope: "cmap:generate",
				});
			}
		} finally {
			setLoading(false);
		}
	}, [programId, termId]);

	const auto = useAutoGenerate([programId, termId], handleGenerate);

	const handleSave = useCallback(async () => {
		if (!payload?.formSubmissionId) return;
		setSaving(true);
		try {
			const result = await saveCurriculumMap(payload.formSubmissionId, {
				plos: plos.map((p) => ({
					ploCode: p.ploCode,
					statement: p.statement,
					evidenceSources: p.evidenceSources,
					dStageCourse: p.dStageCourse,
					validationStatus: p.validationStatus,
				})),
				courses: courses.map((c) => ({
					yearLevel: c.yearLevel,
					courseCode: c.courseCode,
					courseTitle: c.courseTitle,
					cells: c.cells.map((cell) => ({
						ploCode: cell.ploCode,
						stage: cell.stage ?? undefined,
						cloCodes: cell.cloCodes?.join(", ") || undefined,
					})),
				})),
			});
			if (result.ok) {
				toast.create({ title: "Curriculum map saved", type: "success" });
			} else {
				toastError({
					title: "Save failed",
					description: result.error,
					scope: "cmap:save",
				});
			}
		} finally {
			setSaving(false);
		}
	}, [payload, plos, courses]);

	const updateCell = (
		courseIdx: number,
		ploCode: string,
		stage: string | null,
	) => {
		const next = [...courses];
		const course = { ...next[courseIdx] };
		const cells = [...course.cells];
		const cellIdx = cells.findIndex((c) => c.ploCode === ploCode);
		if (cellIdx >= 0) {
			cells[cellIdx] = { ...cells[cellIdx], stage };
		} else {
			cells.push({ ploCode, stage, cloCodes: [] });
		}
		course.cells = cells;
		next[courseIdx] = course;
		setCourses(next);
	};

	if (!payload) {
		return (
			<div className="space-y-6">
				<Frame>
					<FrameHeader>
						<FrameTitle>Initialize Curriculum Map</FrameTitle>
						<FrameDescription>
							Set up the PLO directory and I-P-D × course matrix for a program +
							term.
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

				{/* CLO-PLO Connections - visible even before initialization */}
				{programId.trim() && (
					<Frame>
						<FrameHeader>
							<FrameTitle>CLO-PLO Connections</FrameTitle>
							<FrameDescription>
								Explicitly map Course Learning Outcomes to Program Learning
								Outcomes. These connections are used by the attainment
								computation chain.
							</FrameDescription>
						</FrameHeader>
						<FramePanel>
							<CloPloMapPanel programId={programId} />
						</FramePanel>
					</Frame>
				)}
			</div>
		);
	}

	const ploCodes = plos.map((p) => p.ploCode);

	return (
		<div className="space-y-4">
			<SubmissionStatusCard submissionId={payload.formSubmissionId} />
			{/* Coverage check */}
			<Frame>
				<FrameHeader>
					<FrameTitle>PLO Coverage</FrameTitle>
				</FrameHeader>
				<FramePanel>
					<div className="flex flex-wrap gap-2">
						{plos.map((plo) => (
							<Badge
								key={plo.ploCode}
								variant={
									payload.coverageCheck[plo.ploCode] ? "success" : "destructive"
								}
							>
								{plo.ploCode}:{" "}
								{payload.coverageCheck[plo.ploCode] ? "Covered" : "Gap"}
							</Badge>
						))}
					</div>
				</FramePanel>
			</Frame>

			{/* I-P-D Matrix */}
			<Frame>
				<FrameHeader>
					<FrameTitle>I-P-D × Course Matrix</FrameTitle>
					<FrameDescription>
						Click cells to cycle through I → P → D stages. D-stage coverage
						ensures PLO mapping.
					</FrameDescription>
				</FrameHeader>
				<FramePanel>
					<div className="overflow-x-auto">
						<table className="w-full text-sm">
							<thead>
								<tr className="text-muted-foreground border-b text-left">
									<th className="py-2 pr-4">Course</th>
									{ploCodes.map((code) => (
										<th key={code} className="min-w-15 py-2 pr-2 text-center">
											{code}
										</th>
									))}
								</tr>
							</thead>
							<tbody>
								{courses.map((course, cIdx) => (
									<tr
										key={course.courseCode}
										className="border-b last:border-0"
									>
										<td className="py-2 pr-4">
											<div className="font-medium">{course.courseCode}</div>
											<div className="text-muted-foreground text-xs">
												{course.courseTitle}
											</div>
										</td>
										{ploCodes.map((ploCode) => {
											const cell = course.cells.find(
												(c) => c.ploCode === ploCode,
											);
											const stage = cell?.stage ?? null;
											return (
												<td key={ploCode} className="py-2 pr-2 text-center">
													<Button
														variant="ghost"
														onClick={() => {
															const next =
																stage === "i"
																	? "p"
																	: stage === "p"
																		? "d"
																		: stage === "d"
																			? null
																			: "i";
															updateCell(cIdx, ploCode, next);
														}}
														// The stage colours own the cell's fill/border/text,
														// so the ghost variant's hover chrome is overridden.
														className={`h-8 w-10 rounded border text-xs font-medium transition-colors hover:bg-transparent ${
															stage === "d"
																? "bg-success/20 border-success text-success hover:text-success"
																: stage === "p"
																	? "bg-info/20 border-info text-info hover:text-info"
																	: stage === "i"
																		? "bg-warning/20 border-warning text-warning hover:text-warning"
																		: "bg-background border-input text-muted-foreground hover:bg-muted hover:text-muted-foreground"
														}`}
													>
														{stage ? stage.toUpperCase() : "—"}
													</Button>
												</td>
											);
										})}
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</FramePanel>
			</Frame>

			{/* CLO-PLO Connections */}
			<Frame>
				<FrameHeader>
					<FrameTitle>CLO-PLO Connections</FrameTitle>
					<FrameDescription>
						Explicitly map Course Learning Outcomes to Program Learning
						Outcomes. These connections are used by the attainment computation
						chain.
					</FrameDescription>
				</FrameHeader>
				<FramePanel>
					<CloPloMapPanel programId={programId} />
				</FramePanel>
			</Frame>

			<div className="flex justify-end gap-2">
				<Button
					variant="outline"
					onClick={auto.retry}
					disabled={loading || auto.busy}
				>
					Re-generate
				</Button>
				<Button onClick={handleSave} disabled={saving}>
					{saving ? "Saving..." : "Save"}
				</Button>
			</div>
		</div>
	);
}

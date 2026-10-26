"use client";

import { ChevronDownIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { Spinner } from "@/components/ui/spinner";
import { api } from "@/lib/api-client";

/**
 * Fetches the form's own GET-by-id endpoint (the same data the form screen
 * renders) and shows it inline, so an approver can review the submitted
 * content on `/submissions/[id]` without navigating away. Renders whatever
 * the endpoint returns as structured data.
 */

const ENDPOINT_BY_CODE: Record<string, string> = {
	course_assessment_report: "/car",
	// rollup
	clo_attainment_summary: "/rollup/clo-attainment-summary",
	plo_attainment_summary: "/rollup/plo-attainment-summary",
	cohort_tracking: "/rollup/cohort-tracking",
	// plan
	curriculum_map: "/plan/curriculum-map",
	assessment_calendar: "/plan/assessment-calendar",
	target_setting_matrix: "/plan/target-setting-matrix",
	assessment_budget: "/plan/assessment-budget",
	// cqi
	plo_gap_analysis: "/cqi/plo-gap-analysis",
	cqi_action_plan: "/cqi/cqi-action-plan",
	closing_the_loop: "/cqi/closing-the-loop",
	annual_program_report: "/cqi/annual-program-report",
	// check
	mid_cycle_attainment: "/check/mid-cycle-attainment",
	peer_observation: "/check/peer-observation",
	exhibition_feedback: "/check/exhibition-feedback",
	clo_perception_survey: "/check/clo-perception-survey",
	student_exit_survey: "/check/student-exit-survey",
	portfolio_assessment_record: "/check/portfolio-assessment",
	capstone_panel_evaluation: "/check/capstone-panel",
	// periodic
	resource_monitoring: "/periodic/resource-monitoring",
	alumni_tracer: "/periodic/alumni-tracer",
	employer_satisfaction_survey: "/periodic/employer-survey",
	capa_plan: "/periodic/capa-plan",
	systemic_gap_report: "/periodic/systemic-gap-report",
	institutional_review: "/periodic/institutional-review",
	portfolio_roadmap: "/periodic/portfolio-roadmap",
	// atrisk
	action_taken: "/atrisk/action",
};

function isPrimitive(value: unknown): value is string | number | boolean | null {
	return (
		value === null ||
		typeof value === "string" ||
		typeof value === "number" ||
		typeof value === "boolean"
	);
}

function ValueNode({ value }: { value: unknown }) {
	if (isPrimitive(value)) {
		if (value === null || value === undefined)
			return <span className="text-muted-foreground">—</span>;
		if (typeof value === "boolean") return <span>{value ? "Yes" : "No"}</span>;
		if (typeof value === "number")
			return <span className="tabular-nums">{value}</span>;
		const text = String(value);
		return text.trim() === "" ? (
			<span className="text-muted-foreground">—</span>
		) : (
			<span className="break-words">{text}</span>
		);
	}
	if (Array.isArray(value)) {
		if (value.length === 0)
			return <span className="text-muted-foreground">—</span>;
		if (value.every(isPrimitive)) {
			return (
				<span className="break-words">
					{value.map((v, i) => (
						<span key={i}>
							{i > 0 ? ", " : ""}
							{v === null ? "—" : String(v)}
						</span>
					))}
				</span>
			);
		}
		return (
			<div className="space-y-2">
				{value.map((item, index) => (
					<div
						className="bg-muted/30 rounded-lg border p-3"
						key={index}
					>
						<p className="text-muted-foreground mb-1 text-xs font-medium">
							Item {index + 1}
						</p>
						<ValueNode value={item} />
					</div>
				))}
			</div>
		);
	}
	if (typeof value === "object") {
		const entries = Object.entries(value as Record<string, unknown>).filter(
			([, v]) => v !== undefined,
		);
		if (entries.length === 0)
			return <span className="text-muted-foreground">—</span>;
		return (
			<dl className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
				{entries.map(([key, val]) => (
					<div className="flex flex-col gap-0.5" key={key}>
						<dt className="text-muted-foreground text-xs font-medium">
							{key
								.replace(/([a-z])([A-Z])/g, "$1 $2")
								.replace(/[_-]+/g, " ")
								.trim()
								.replace(/^./, (c) => c.toUpperCase())}
						</dt>
						<dd className="text-sm">
							<ValueNode value={val} />
						</dd>
					</div>
				))}
			</dl>
		);
	}
	return <span>{String(value)}</span>;
}

export function SubmissionRelatedData({
	submissionId,
	formCode,
}: {
	submissionId: string;
	formCode: string | undefined;
}) {
	const [data, setData] = useState<unknown>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(false);
	const [open, setOpen] = useState(true);

	const path = formCode ? ENDPOINT_BY_CODE[formCode] : undefined;

	useEffect(() => {
		if (!path) {
			setLoading(false);
			return;
		}
		let active = true;
		setLoading(true);
		api
			.get<unknown>(`${path}/${submissionId}`)
			.then((result) => {
				if (!active) return;
				setData(result);
				setError(false);
			})
			.catch(() => {
				if (!active) return;
				setError(true);
			})
			.finally(() => {
				if (active) setLoading(false);
			});
		return () => {
			active = false;
		};
	}, [path, submissionId]);

	if (!path) return null;

	return (
		<section className="bg-card space-y-3 rounded-xl border p-5 shadow-sm sm:p-6">
			<button
				className="flex w-full items-center justify-between gap-2 text-left"
				onClick={() => setOpen((v) => !v)}
				type="button"
			>
				<h3 className="text-base font-semibold">Form content</h3>
				<ChevronDownIcon
					className={`text-muted-foreground size-4 transition-transform ${
						open ? "rotate-180" : ""
					}`}
				/>
			</button>
			{loading ? (
				<div className="text-muted-foreground flex items-center gap-2 text-sm">
					<Spinner className="size-4" /> Loading form content…
				</div>
			) : error ? (
				<p className="text-muted-foreground text-sm">
					Form content could not be loaded.
				</p>
			) : open ? (
				<div className="text-sm">
					<ValueNode value={data} />
				</div>
			) : null}
		</section>
	);
}

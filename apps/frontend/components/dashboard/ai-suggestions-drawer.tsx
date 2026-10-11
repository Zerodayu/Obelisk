"use client";

import { useAtomValue } from "jotai";
import { Bot, RefreshCw, SparklesIcon } from "lucide-react";
import { Fragment, useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import {
	Drawer,
	DrawerClose,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
	DrawerTrigger,
} from "@/components/ui/drawer";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { toastError } from "@/components/ui/toast";
import { IPD_STAGES } from "@/lib/constants/obe";
import { canAccess } from "@/lib/role-access";
import { userAtom } from "@/lib/store/atoms/user";
import {
	type AiRecommendation,
	generateAiRecommendationAction,
	getLatestAiRecommendationAction,
} from "@/server/actions/ai";
import { type AtRiskFlagRow, listAtRiskFlags } from "@/server/actions/at-risk";

/**
 * Floating AI suggestions drawer for dashboards. Opens a bottom-sheet drawer
 * with the latest persisted AI CQI recommendation (`ai_recommendation`,
 * backend `src/v1/ai` → python-server `/analytics/institutional-summary`).
 *
 * The recommendation text is Markdown (LLM output — the python-server's debug
 * stub while `IS_DEBUG_MODE=True`). It is rendered by the minimal converter
 * below into plain HTML elements, styled by the `typeset` classes — no
 * markdown library (see `renderMarkdown`). The "key gaps" and "pedagogical
 * context" blocks are pure computed data, independent of the LLM — the latter
 * carries each section's Bloom's level, I-P-D stage and assessment types as
 * stored with the recommendation.
 *
 * The "at-risk students" block is live `GET /atrisk/flags` data grouped by the
 * student's program — fetched alongside the recommendation (never stored in
 * it) and rendered only for `viewAiInsights` roles, since it names students.
 */

type DrawerState =
	| { phase: "loading" }
	| { phase: "ready"; recommendation: AiRecommendation | null }
	| { phase: "error"; message: string };

/** Live at-risk flags — its own slice so a flags failure never hides the insight. */
type FlagsState =
	| { phase: "idle" }
	| { phase: "ready"; rows: AtRiskFlagRow[] }
	| { phase: "error" };

const STATUS_LABELS: Record<string, string> = {
	pending_review: "Pending review",
	acknowledged: "Acknowledged",
	actioned: "Actioned",
	dismissed: "Dismissed",
};

// NOTE: a busy term carries 100+ alignment rows; the drawer caps what it
// renders — the stored record keeps every row.
const VISIBLE_ALIGNMENT_ROWS = 50;

/** `i`/`p`/`d` → "Introduction (I)"; null → em dash (never invented). */
function ipdLabel(stage: string | null): string {
	if (!stage) return "—";
	const meta = IPD_STAGES[stage.toLowerCase()];
	return meta ? `${meta.label} (${meta.letter})` : stage.toUpperCase();
}

function scopeLabel(recommendation: AiRecommendation): string | null {
	if (recommendation.period) return recommendation.period.label;
	if (recommendation.term) {
		return `${recommendation.term.schoolYear} ${recommendation.term.semester}`;
	}
	return null;
}

// --- Minimal Markdown → React rendering ------------------------------------
// NOTE: intentionally hand-rolled — no markdown dependency (project decision).
// Covers the subset the python-server's CQI prompt guarantees: `#`–`####`
// headings, paragraphs, `-`/`*` bullets, `1.` ordered lists, `> ` quotes, and
// inline `**bold**` / `*italic*` / `_italic_`. Unknown syntax falls through as
// plain text; `typeset` styles the resulting elements. No raw HTML passes
// through (everything is built as React elements).

type InlineNode = string | { marker: "strong" | "em"; content: string };

const INLINE_PATTERN = /(\*\*[^*]+\*\*|\*[^*\n]+\*|_[^_\n]+_)/g;

function parseInline(text: string): InlineNode[] {
	return text
		.split(INLINE_PATTERN)
		.filter((part) => part !== "" && part !== undefined)
		.map((part) => {
			if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
				return { marker: "strong" as const, content: part.slice(2, -2) };
			}
			if (
				(part.startsWith("*") && part.endsWith("*")) ||
				(part.startsWith("_") && part.endsWith("_"))
			) {
				if (part.length > 2) {
					return { marker: "em" as const, content: part.slice(1, -1) };
				}
			}
			return part;
		});
}

function renderInline(text: string, keyBase: string): React.ReactNode {
	return parseInline(text).map((node, index) => {
		const key = `${keyBase}-${index}`;
		if (typeof node === "string") return <Fragment key={key}>{node}</Fragment>;
		const content = renderInline(node.content, key);
		if (node.marker === "strong") return <strong key={key}>{content}</strong>;
		return <em key={key}>{content}</em>;
	});
}

function renderMarkdown(markdown: string): React.ReactNode[] {
	const nodes: React.ReactNode[] = [];
	const lines = markdown.split(/\r?\n/);
	let paragraph: string[] = [];
	let list: { ordered: boolean; items: string[] } | null = null;
	let key = 0;

	const nextKey = () => `md-${key++}`;

	const flushParagraph = () => {
		if (!paragraph.length) return;
		const text = paragraph.join(" ").trim();
		paragraph = [];
		if (!text) return;
		const nodeKey = nextKey();
		nodes.push(<p key={nodeKey}>{renderInline(text, nodeKey)}</p>);
	};

	const flushList = () => {
		if (!list) return;
		const { ordered, items } = list;
		const nodeKey = nextKey();
		const children = items.map((item, index) => {
			const itemKey = `${nodeKey}-${index}`;
			return <li key={itemKey}>{renderInline(item, itemKey)}</li>;
		});
		list = null;
		nodes.push(
			ordered ? (
				<ol key={nodeKey}>{children}</ol>
			) : (
				<ul key={nodeKey}>{children}</ul>
			),
		);
	};

	const flush = () => {
		flushParagraph();
		flushList();
	};

	for (const raw of lines) {
		const line = raw.trim();
		if (!line) {
			flush();
			continue;
		}

		const heading = /^(#{1,4})\s+(.*)$/.exec(line);
		if (heading) {
			flush();
			const nodeKey = nextKey();
			const content = renderInline(heading[2], nodeKey);
			const level = heading[1].length;
			if (level === 1) nodes.push(<h1 key={nodeKey}>{content}</h1>);
			else if (level === 2) nodes.push(<h2 key={nodeKey}>{content}</h2>);
			else nodes.push(<h3 key={nodeKey}>{content}</h3>);
			continue;
		}

		const ordered = /^\d+[.)]\s+(.*)$/.exec(line);
		const bullet = !ordered ? /^[-*+]\s+(.*)$/.exec(line) : null;
		if (ordered || bullet) {
			flushParagraph();
			const isOrdered = Boolean(ordered);
			if (!list || list.ordered !== isOrdered) {
				flushList();
				list = { ordered: isOrdered, items: [] };
			}
			list.items.push((ordered ?? bullet)?.[1] ?? "");
			continue;
		}

		const quote = /^>\s?(.*)$/.exec(line);
		if (quote) {
			flush();
			const nodeKey = nextKey();
			nodes.push(
				<blockquote key={nodeKey}>
					{renderInline(quote[1], nodeKey)}
				</blockquote>,
			);
			continue;
		}

		flushList();
		paragraph.push(line);
	}
	flush();

	return nodes;
}

// --- Drawer ----------------------------------------------------------------

export function AiSuggestionsDrawer() {
	const user = useAtomValue(userAtom);
	// NOTE: drawer + at-risk table gate; the Regenerate button stays narrower.
	const canView = canAccess(user?.role, "viewAiInsights");
	const canGenerate = canAccess(user?.role, "generateAiInsights");

	const [state, setState] = useState<DrawerState>({ phase: "loading" });
	const [flags, setFlags] = useState<FlagsState>({ phase: "idle" });
	const [hasLoaded, setHasLoaded] = useState(false);
	const [generating, setGenerating] = useState(false);

	const loadFlags = useCallback(async () => {
		const result = await listAtRiskFlags();
		setFlags(
			result.ok ? { phase: "ready", rows: result.data } : { phase: "error" },
		);
	}, []);

	const load = useCallback(async () => {
		setState({ phase: "loading" });
		// NOTE: independent fetch — a flags failure must not hide the insight.
		if (canView) void loadFlags();
		const result = await getLatestAiRecommendationAction();
		if (result.ok) {
			setState({ phase: "ready", recommendation: result.data });
		} else {
			setState({ phase: "error", message: result.error });
		}
		setHasLoaded(true);
	}, [canView, loadFlags]);

	const handleOpenChange = useCallback(
		(open: boolean) => {
			// NOTE: fetch on first open (`hasLoaded` keeps reopening cheap);
			// flags refetch every open — they clear on a final approval.
			if (!open || generating) return;
			if (!hasLoaded) void load();
			else if (canView) void loadFlags();
		},
		[hasLoaded, generating, load, canView, loadFlags],
	);

	const handleGenerate = useCallback(async () => {
		setGenerating(true);
		const result = await generateAiRecommendationAction();
		setGenerating(false);
		if (result.ok) {
			setState({ phase: "ready", recommendation: result.data });
			return;
		}
		// NOTE: no HTTP status crosses the ActionResult boundary, so the toast
		// dedupes on the flow scope instead of a status code.
		toastError({
			scope: "ai-insights-generate",
			title: "Could not generate AI insights",
			description: result.error,
		});
	}, []);

	// NOTE: after the hooks — dean and below never see the drawer at all.
	if (!canView) return null;

	return (
		<Drawer swipeDirection="right" onOpenChange={handleOpenChange}>
			<DrawerTrigger
				render={
					<Button variant="secondary">
						<SparklesIcon />
						Ai Insights/Suggestions
					</Button>
				}
			/>
			<DrawerContent className="flex w-2xl">
				<DrawerHeader>
					<DrawerTitle className="flex items-center justify-center gap-2 self-center">
						<Bot />
						AI Suggestions
					</DrawerTitle>
					<DrawerDescription className="flex items-center justify-center">
						CQI insights generated from your persisted assessment data.
					</DrawerDescription>
				</DrawerHeader>
				<ScrollArea className="bg-input/40 m-4 flex-1 overflow-y-auto rounded-lg">
					<div className="typeset typeset-docs w-full items-center justify-center p-6">
						{state.phase === "loading" ? <LoadingBlock /> : null}
						{state.phase === "error" ? (
							<ErrorBlock message={state.message} onRetry={load} />
						) : null}
						{state.phase === "ready" ? (
							<ReadyBlock
								recommendation={state.recommendation}
								canGenerate={canGenerate}
								generating={generating}
								onGenerate={handleGenerate}
							/>
						) : null}
						{/* NOTE: independent of the recommendation state — live flags
						    render even while it loads, errors, or is still empty. */}
						<AtRiskBlock flags={flags} />
					</div>
				</ScrollArea>
				<DrawerFooter className="flex-row justify-center gap-2">
					{canGenerate && state.phase === "ready" ? (
						<Button
							variant="secondary"
							onClick={handleGenerate}
							disabled={generating}
						>
							<RefreshCw className={generating ? "animate-spin" : undefined} />
							{generating ? "Generating…" : "Regenerate"}
						</Button>
					) : null}
					<DrawerClose render={<Button className="flex-1">Close</Button>} />
				</DrawerFooter>
			</DrawerContent>
		</Drawer>
	);
}

const LoadingBlock = () => (
	<div className="space-y-3" aria-busy="true" aria-live="polite">
		<span className="sr-only">Loading AI insights…</span>
		<Skeleton className="h-5 w-1/3" />
		<Skeleton className="h-4 w-full" />
		<Skeleton className="h-4 w-5/6" />
		<Skeleton className="h-24 w-full" />
		<Skeleton className="h-4 w-2/3" />
	</div>
);

const ErrorBlock = ({
	message,
	onRetry,
}: {
	message: string;
	onRetry: () => Promise<void>;
}) => (
	<div className="not-typeset flex w-full flex-col space-y-4 text-sm">
		<p className="text-muted-foreground self-center">{message}</p>
		<Button variant="secondary" onClick={onRetry}>
			Try again
		</Button>
	</div>
);

const EmptyBlock = ({
	canGenerate,
	generating,
	onGenerate,
}: {
	canGenerate: boolean;
	generating: boolean;
	onGenerate: () => Promise<void>;
}) => (
	<div className="not-typeset space-y-4 text-sm">
		<p className="text-muted-foreground">
			No AI insight has been generated yet.
		</p>
		<p className="text-muted-foreground">
			{canGenerate
				? "Generate one to analyse the persisted class records and surface the critical CLO gaps."
				: "Ask a VPAA or system administrator to generate one."}
		</p>
		{canGenerate ? (
			<Button variant="secondary" onClick={onGenerate} disabled={generating}>
				<RefreshCw className={generating ? "animate-spin" : undefined} />
				{generating ? "Generating…" : "Generate insight"}
			</Button>
		) : null}
	</div>
);

const ReadyBlock = ({
	recommendation,
	canGenerate,
	generating,
	onGenerate,
}: {
	recommendation: AiRecommendation | null;
	canGenerate: boolean;
	generating: boolean;
	onGenerate: () => Promise<void>;
}) => {
	if (!recommendation) {
		return (
			<EmptyBlock
				canGenerate={canGenerate}
				generating={generating}
				onGenerate={onGenerate}
			/>
		);
	}

	const label = scopeLabel(recommendation);
	const gaps = recommendation.worstPerformingClos;
	const alignment = recommendation.alignmentContext;
	const visibleAlignment = alignment.slice(0, VISIBLE_ALIGNMENT_ROWS);

	return (
		<div>
			<div className="not-typeset mb-4 flex flex-wrap items-center gap-2">
				{label ? (
					<span className="bg-muted text-muted-foreground rounded-full px-2.5 py-0.5 text-xs font-medium">
						{label}
					</span>
				) : null}
				<span className="bg-muted text-muted-foreground rounded-full px-2.5 py-0.5 text-xs font-medium">
					{STATUS_LABELS[recommendation.status] ?? recommendation.status}
				</span>
				<span className="text-muted-foreground text-xs">
					Generated {new Date(recommendation.generatedAt).toLocaleString()}
				</span>
			</div>

			{renderMarkdown(recommendation.recommendationText)}

			{gaps.length > 0 ? (
				<>
					<h2>Key gaps (computed)</h2>
					<table>
						<thead>
							<tr>
								<th>Level</th>
								<th>Unit</th>
								<th>CLO</th>
								<th>Mean</th>
								<th>Records</th>
							</tr>
						</thead>
						<tbody>
							{gaps.map((gap) => (
								<tr key={`${gap.groupName}-${gap.key}-${gap.cloCode}`}>
									<td>{gap.groupName}</td>
									<td>{gap.key}</td>
									<td>{gap.cloCode}</td>
									<td>{gap.meanAttainmentPct}%</td>
									<td>{gap.recordCount}</td>
								</tr>
							))}
						</tbody>
					</table>
				</>
			) : null}

			{alignment.length > 0 ? (
				<>
					<h2>Pedagogical context</h2>
					<table>
						<thead>
							<tr>
								<th>Course</th>
								<th>Section</th>
								<th>CLO</th>
								<th>Bloom's</th>
								<th>I-P-D</th>
								<th>Assessment evidence</th>
							</tr>
						</thead>
						<tbody>
							{visibleAlignment.map((row) => (
								<tr key={`${row.courseCode}-${row.section}-${row.cloCode}`}>
									<td>{row.courseCode}</td>
									<td>{row.section}</td>
									<td>{row.cloCode}</td>
									<td>{row.bloomsLevel ?? "—"}</td>
									<td>{ipdLabel(row.ipdStage)}</td>
									<td>
										{row.assessmentTypes.length
											? row.assessmentTypes.join(", ")
											: "—"}
									</td>
								</tr>
							))}
						</tbody>
					</table>
					{alignment.length > visibleAlignment.length ? (
						<p>
							<em>
								Showing {visibleAlignment.length} of {alignment.length} aligned
								CLOs — every row is stored with this recommendation.
							</em>
						</p>
					) : null}
				</>
			) : null}

			<p>
				<em>
					AI-generated suggestions — validate against institutional policy
					before acting. Gap figures are computed from persisted attainment data
					(70% institutional floor).
				</em>
			</p>
		</div>
	);
};

// --- At-risk students (live) ------------------------------------------------

/** "IT 101 §1A" — em dash when the flag carries no attainment row. */
function atRiskSectionLabel(row: AtRiskFlagRow): string {
	const section = row.cloAttainment?.classSection;
	return section ? `${section.course.code} §${section.sectionCode}` : "—";
}

/**
 * Live `GET /atrisk/flags` rows grouped by the student's program — biggest
 * group first, then alphabetical. Never stored with the recommendation.
 */
const AtRiskBlock = ({ flags }: { flags: FlagsState }) => {
	if (flags.phase === "idle") return null;

	const heading = <h2>At-risk students (by program)</h2>;
	if (flags.phase === "error") {
		return (
			<>
				{heading}
				<p>
					<em>
						At-risk list unavailable right now — reopen the drawer to retry.
					</em>
				</p>
			</>
		);
	}

	const rows = flags.rows;
	if (rows.length === 0) {
		return (
			<>
				{heading}
				<p>
					<em>No active at-risk flags.</em>
				</p>
			</>
		);
	}

	const groups = new Map<string, AtRiskFlagRow[]>();
	for (const row of rows) {
		const name = row.student.program.name;
		const bucket = groups.get(name);
		if (bucket) bucket.push(row);
		else groups.set(name, [row]);
	}
	const ordered = [...groups.entries()].sort(
		([nameA, rowsA], [nameB, rowsB]) =>
			rowsB.length - rowsA.length || nameA.localeCompare(nameB),
	);

	// NOTE: same cap as the alignment table — a busy term flags a lot of rows.
	let budget = VISIBLE_ALIGNMENT_ROWS;
	let rendered = 0;
	const visible: {
		name: string;
		count: number;
		rows: AtRiskFlagRow[];
	}[] = [];
	for (const [name, group] of ordered) {
		const take = Math.min(group.length, budget);
		if (take === 0) break;
		visible.push({ name, count: group.length, rows: group.slice(0, take) });
		budget -= take;
		rendered += take;
	}

	return (
		<>
			{heading}
			{visible.map((group) => (
				<Fragment key={group.name}>
					<h3>
						{group.name} ({group.count})
					</h3>
					<table>
						<thead>
							<tr>
								<th>Student</th>
								<th>Student no.</th>
								<th>CLO</th>
								<th>Course §Section</th>
								<th>Reason</th>
								<th>Flagged</th>
							</tr>
						</thead>
						<tbody>
							{group.rows.map((row) => (
								<tr key={row.id}>
									<td>
										{row.student.firstName} {row.student.lastName}
									</td>
									<td>{row.student.studentNumber}</td>
									<td>{row.cloAttainment?.clo.code ?? "—"}</td>
									<td>{atRiskSectionLabel(row)}</td>
									<td>{row.reason}</td>
									<td>{new Date(row.flaggedAt).toLocaleDateString()}</td>
								</tr>
							))}
						</tbody>
					</table>
				</Fragment>
			))}
			{rows.length > rendered ? (
				<p>
					<em>
						Showing {rendered} of {rows.length} at-risk flags — grouped by the
						student's program.
					</em>
				</p>
			) : null}
		</>
	);
};

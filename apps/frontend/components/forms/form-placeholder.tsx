import { PendingSection } from "@/components/dashboard/role-dashboard-shell";

/**
 * Shared scaffold for a form screen. Renders the form identity (title + stable
 * code + PDCA stage). When `children` are provided they render in place of the
 * placeholder box — screens use this to show sample-data charts while the
 * corresponding backend phase lands. Each form becomes a real
 * react-hook-form + Zod screen as the backend contract stabilizes.
 */
export function FormPlaceholder({
	title,
	code,
	pdcaStage,
	description,
	children,
}: {
	title: string;
	code: string;
	pdcaStage: string;
	description?: string;
	children?: React.ReactNode;
}) {
	return (
		<div className="space-y-6 px-4 lg:px-6">
			<div className="space-y-1">
				<div className="flex flex-wrap items-center gap-2">
					<h2 className="text-xl font-semibold tracking-tight">{title}</h2>
					<span className="border-border bg-muted text-muted-foreground rounded-full border px-2.5 py-0.5 font-mono text-xs">
						{code}
					</span>
					<span className="border-border bg-muted text-muted-foreground rounded-full border px-2.5 py-0.5 text-xs">
						{pdcaStage}
					</span>
				</div>
				{description ? (
					<p className="text-muted-foreground text-sm">{description}</p>
				) : null}
			</div>
			{children ?? <PendingSection label={`${title} screen`} />}
		</div>
	);
}

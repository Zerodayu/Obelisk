"use client";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loading/failed block for a form that pre-generates: `busy` shows skeleton
 * lines while the payload for the current academic context is produced (and
 * during the debounce before a run starts), idle shows a failed state whose
 * Retry re-runs the same handler instead of asking the user to flip context.
 */
export function GeneratingState({
	busy,
	retry,
}: {
	busy: boolean;
	retry: () => void;
}) {
	if (!busy) {
		return (
			<div className="text-muted-foreground flex items-center justify-between gap-3 rounded-xl border border-dashed p-4 text-sm">
				<span>Form data could not be generated.</span>
				<Button variant="outline" size="sm" onClick={retry}>
					Retry
				</Button>
			</div>
		);
	}

	return (
		<div role="status" aria-label="Generating form data…" className="space-y-4">
			{/* Status strip (SubmissionStatusCard stand-in), field grid, body. */}
			<Skeleton className="h-16 w-full rounded-xl" />
			<div className="grid gap-4 sm:grid-cols-3">
				<div className="space-y-2">
					<Skeleton className="h-3 w-16" />
					<Skeleton className="h-9 rounded-md" />
				</div>
				<div className="space-y-2">
					<Skeleton className="h-3 w-20" />
					<Skeleton className="h-9 rounded-md" />
				</div>
				<div className="space-y-2">
					<Skeleton className="h-3 w-14" />
					<Skeleton className="h-9 rounded-md" />
				</div>
			</div>
			<Skeleton className="h-40 w-full rounded-xl" />
		</div>
	);
}

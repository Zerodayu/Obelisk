"use client";

import { useAtomValue } from "jotai";
import { useEffect, useState } from "react";

import {
	selectedProgramIdAtom,
	selectedTermIdAtom,
} from "@/lib/store/atoms/academic";
import { type CqiLoopStatus, getLoopStatusAction } from "@/server/actions/cqi";

function termLabel(term: { schoolYear: string; semester: string }): string {
	return `${term.schoolYear} ${term.semester}`;
}

/** Fetch the derived loop status for the selected program+term. */
export function useLoopStatus(): CqiLoopStatus | null {
	const programId = useAtomValue(selectedProgramIdAtom);
	const termId = useAtomValue(selectedTermIdAtom);
	const [status, setStatus] = useState<CqiLoopStatus | null>(null);

	useEffect(() => {
		if (!programId?.trim() || !termId?.trim()) {
			setStatus(null);
			return;
		}
		let cancelled = false;
		void getLoopStatusAction(programId.trim(), termId.trim()).then((result) => {
			if (!cancelled && result.ok) setStatus(result.data);
		});
		return () => {
			cancelled = true;
		};
	}, [programId, termId]);

	return status;
}

/** Derived loop status banner, with a prior-loop warning. */
export function LoopStatusBanner({ status }: { status: CqiLoopStatus | null }) {
	if (!status || status.total === 0) return null;

	const open = status.openReassess + status.openNotImplemented;
	const currentLabel = status.isClosed
		? "loop closed"
		: `${open} open · ${status.notRecorded} not recorded`;

	return (
		<div className="bg-muted text-muted-foreground space-y-1 rounded-xl border p-3 text-sm">
			<div>
				<span className="text-foreground font-medium">Current loop</span> —{" "}
				{status.term ? termLabel(status.term) : status.termId}: {currentLabel}.
			</div>
			{status.prior && !status.prior.isClosed ? (
				<div className="text-amber-600">
					Prior loop ({termLabel(status.prior.term)}) still has{" "}
					{status.prior.openLoops} open loop(s) — revisit before starting this
					cycle.
				</div>
			) : null}
		</div>
	);
}

"use client";

import { ChevronDownIcon } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/reui/badge";

import { humanizeKey, SubmissionValue } from "./submission-value";

export function SubmissionDetails({ formData }: { formData: unknown }) {
	const [open, setOpen] = useState(true);
	const entries =
		formData && typeof formData === "object" && !Array.isArray(formData)
			? Object.entries(formData as Record<string, unknown>).filter(
					([, v]) => v !== null && v !== undefined,
				)
			: [];

	if (entries.length === 0) return null;

	return (
		<section className="bg-card space-y-3 rounded-xl border p-5 shadow-sm sm:p-6">
			<button
				className="flex w-full items-center justify-between gap-2 text-left"
				onClick={() => setOpen((v) => !v)}
				type="button"
			>
				<h3 className="text-base font-semibold">Submitted details</h3>
				<ChevronDownIcon
					className={`text-muted-foreground size-4 transition-transform ${
						open ? "rotate-180" : ""
					}`}
				/>
			</button>
			{open ? (
				<div className="space-y-4">
					{entries.map(([key, value]) => (
						<div className="space-y-1.5" key={key}>
							<div className="flex items-center gap-2">
								<Badge variant="outline">{humanizeKey(key)}</Badge>
							</div>
							<div className="text-sm">
								<SubmissionValue value={value} />
							</div>
						</div>
					))}
				</div>
			) : null}
		</section>
	);
}

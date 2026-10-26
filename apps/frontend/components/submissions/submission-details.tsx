"use client";

import { ChevronDownIcon } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/reui/badge";

function humanizeKey(key: string): string {
	return key
		.replace(/([a-z])([A-Z])/g, "$1 $2")
		.replace(/[_-]+/g, " ")
		.replace(/\s+/g, " ")
		.trim()
		.replace(/^./, (c) => c.toUpperCase());
}

function isPrimitive(value: unknown): value is string | number | boolean | null {
	return (
		value === null ||
		typeof value === "string" ||
		typeof value === "number" ||
		typeof value === "boolean"
	);
}

function PrimitiveValue({ value }: { value: unknown }) {
	if (value === null || value === undefined) {
		return <span className="text-muted-foreground">—</span>;
	}
	if (typeof value === "boolean") {
		return <span>{value ? "Yes" : "No"}</span>;
	}
	if (typeof value === "number") {
		return <span className="tabular-nums">{value}</span>;
	}
	const text = String(value);
	if (text.trim() === "") {
		return <span className="text-muted-foreground">—</span>;
	}
	return <span className="break-words">{text}</span>;
}

function ValueNode({ value }: { value: unknown }) {
	if (isPrimitive(value)) {
		return <PrimitiveValue value={value} />;
	}

	if (Array.isArray(value)) {
		if (value.length === 0) {
			return <span className="text-muted-foreground">—</span>;
		}
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
		if (entries.length === 0) {
			return <span className="text-muted-foreground">—</span>;
		}
		return (
			<dl className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
				{entries.map(([key, val]) => (
					<div className="flex flex-col gap-0.5" key={key}>
						<dt className="text-muted-foreground text-xs font-medium">
							{humanizeKey(key)}
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
								<ValueNode value={value} />
							</div>
						</div>
					))}
				</div>
			) : null}
		</section>
	);
}

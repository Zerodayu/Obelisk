"use client";

/**
 * Shared recursive renderer for a submission's stored data — used by both the
 * "Submitted details" panel (raw `formData`) and the "Form content" panel (the
 * form's own GET-by-id payload). The only opinionated bit: arrays of objects
 * render as a table (columns = union of keys, one row per item) instead of the
 * stacked "Item N" boxes a generic recursion would produce, because most form
 * payloads are homogeneous row lists (CLO/PLO/student/cohort rows).
 */

export function humanizeKey(key: string): string {
	return key
		.replace(/([a-z])([A-Z])/g, "$1 $2")
		.replace(/[_-]+/g, " ")
		.replace(/\s+/g, " ")
		.trim()
		.replace(/^./, (c) => c.toUpperCase());
}

function isPrimitive(
	value: unknown,
): value is string | number | boolean | null {
	return (
		value === null ||
		typeof value === "string" ||
		typeof value === "number" ||
		typeof value === "boolean"
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function Empty() {
	return <span className="text-muted-foreground">—</span>;
}

function PrimitiveValue({ value }: { value: unknown }) {
	if (value === null || value === undefined) return <Empty />;
	if (typeof value === "boolean") return <span>{value ? "Yes" : "No"}</span>;
	if (typeof value === "number")
		return <span className="tabular-nums">{value}</span>;
	const text = String(value);
	return text.trim() === "" ? (
		<Empty />
	) : (
		<span className="break-words">{text}</span>
	);
}

function ObjectArrayTable({ rows }: { rows: Record<string, unknown>[] }) {
	const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
	return (
		<div className="overflow-x-auto rounded-lg border">
			<table className="w-full text-sm">
				<thead>
					<tr className="text-muted-foreground border-b text-left">
						{columns.map((column) => (
							<th
								className="px-3 py-2 pr-4 font-medium whitespace-nowrap"
								key={column}
							>
								{humanizeKey(column)}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{rows.map((row, index) => (
						<tr className="border-b last:border-0" key={index}>
							{columns.map((column) => (
								<td className="px-3 py-2 pr-4 align-top" key={column}>
									<SubmissionValue value={row[column]} />
								</td>
							))}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

export function SubmissionValue({ value }: { value: unknown }) {
	if (isPrimitive(value)) return <PrimitiveValue value={value} />;

	if (Array.isArray(value)) {
		if (value.length === 0) return <Empty />;
		if (value.every(isPrimitive)) {
			return (
				<span className="break-words">
					{value.map((item, i) => (
						<span key={i}>
							{i > 0 ? ", " : ""}
							{item === null ? "—" : String(item)}
						</span>
					))}
				</span>
			);
		}
		if (value.every(isRecord)) {
			return <ObjectArrayTable rows={value} />;
		}
		return (
			<div className="space-y-2">
				{value.map((item, index) => (
					<div className="bg-muted/30 rounded-lg border p-3" key={index}>
						<p className="text-muted-foreground mb-1 text-xs font-medium">
							Item {index + 1}
						</p>
						<SubmissionValue value={item} />
					</div>
				))}
			</div>
		);
	}

	if (isRecord(value)) {
		const entries = Object.entries(value).filter(([, v]) => v !== undefined);
		if (entries.length === 0) return <Empty />;
		return (
			<dl className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
				{entries.map(([key, val]) => (
					<div className="flex flex-col gap-0.5" key={key}>
						<dt className="text-muted-foreground text-xs font-medium">
							{humanizeKey(key)}
						</dt>
						<dd className="text-sm">
							<SubmissionValue value={val} />
						</dd>
					</div>
				))}
			</dl>
		);
	}

	return <span>{String(value)}</span>;
}

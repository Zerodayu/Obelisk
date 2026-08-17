/**
 * Minimal CSV/TSV parser for the per-student score re-import endpoint.
 *
 * Handles quoted fields (double-quote escape), CRLF/LF line endings, and
 * auto-detects the delimiter (comma vs tab). Returns rows as string arrays.
 * No new dependencies — the payload is small (per-student roster) and strict.
 */

export function detectDelimiter(firstLine: string): "," | "\t" {
	const comma = firstLine.split(",").length;
	const tab = firstLine.split("\t").length;
	return comma >= tab ? "," : "\t";
}

/**
 * Parses a CSV/TSV string into rows of cells. Quoted fields may contain
 * the delimiter, newlines, and doubled quotes ("" → "). Blank lines are
 * skipped. Returns [] for empty input.
 */
export function parseCsv(input: string): string[][] {
	if (input.trim() === "") return [];

	const delimiter = detectDelimiter(input.split(/\r?\n/, 1)[0] ?? "");
	const rows: string[][] = [];
	let row: string[] = [];
	let cell = "";
	let inQuotes = false;

	const pushCell = () => {
		row.push(cell);
		cell = "";
	};

	const pushRow = () => {
		pushCell();
		if (row.some((c) => c !== "")) rows.push(row);
		row = [];
	};

	for (let i = 0; i < input.length; i += 1) {
		const ch = input[i];

		if (inQuotes) {
			if (ch === '"') {
				if (input[i + 1] === '"') {
					cell += '"';
					i += 1;
				} else {
					inQuotes = false;
				}
			} else {
				cell += ch;
			}
			continue;
		}

		if (ch === '"') {
			inQuotes = true;
		} else if (ch === delimiter) {
			pushCell();
		} else if (ch === "\n") {
			pushRow();
		} else if (ch === "\r") {
			if (input[i + 1] === "\n") continue;
			pushRow();
		} else {
			cell += ch;
		}
	}

	// Flush trailing content (no trailing newline).
	if (cell !== "" || row.length > 0) {
		pushRow();
	}

	return rows;
}

/** Normalizes a cell value: trims whitespace; returns undefined when blank. */
export function csvCell(value: string | undefined): string | undefined {
	const trimmed = (value ?? "").trim();
	return trimmed === "" ? undefined : trimmed;
}

/** Parses a numeric percentage cell ("85" or "0.85") → 0–100 range. */
export function csvPercent(value: string | undefined): number | undefined {
	const text = csvCell(value);
	if (text === undefined) return undefined;

	const parsed = Number(text);
	if (Number.isNaN(parsed)) return undefined;

	// Accept both 0–100 scale and 0–1 fraction (ETL output uses fractions).
	const normalized = parsed <= 1 ? parsed * 100 : parsed;
	if (normalized < 0 || normalized > 100) return undefined;
	return Math.round(normalized * 100) / 100;
}

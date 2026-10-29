import { readdirSync } from "node:fs";

import { parseCsv } from "@lib/ingest/csv";
import { prisma } from "@lib/prisma";

/* NOTE: dev-only whole-database CSV import (`just db-import <dir>`) — replaces
 * all existing rows by truncating every table, then re-inserting from the
 * per-table CSVs in `<dir>` (the export side: `just db-export`).
 * Dev-only by construction: wired to the dev DATABASE_URL via .env.local, never
 * a prod path.
 * NOTE: `session_replication_role = replica` disables FK enforcement for the
 * insert phase so CSV rows can land in any order — dev restore tool. */

const SCHEMA = "public";

type TableRow = { table_name: string };
type ColumnRow = { column_name: string; data_type: string };

type InsertDelegate = {
	create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
};

function toCamelCase(snake: string): string {
	const parts = snake.split("_").filter((p) => p.length > 0);
	const first = parts[0] ?? snake;
	const rest = parts
		.slice(1)
		.map((p) => p.charAt(0).toUpperCase() + p.slice(1));
	return first + rest.join("");
}

function convertValue(dataType: string, cell: string): unknown {
	const text = cell.trim();
	if (text === "") return null;
	if (dataType.startsWith("timestamp") || dataType.startsWith("date")) {
		return new Date(text);
	}
	if (dataType === "boolean") return text === "true";
	if (["integer", "bigint", "numeric", "decimal"].includes(dataType)) {
		return Number(text);
	}
	if (dataType === "json" || dataType === "jsonb") {
		try {
			return JSON.parse(text);
		} catch {
			return text;
		}
	}
	return text;
}

async function listTables(): Promise<string[]> {
	const tables = await prisma.$queryRawUnsafe<TableRow[]>(`
		SELECT table_name
		FROM information_schema.tables
		WHERE table_schema = '${SCHEMA}'
		  AND table_type = 'BASE TABLE'
		  AND table_name NOT LIKE '\\_%' ESCAPE '\\'
		ORDER BY table_name;
	`);
	return tables.map((t) => t.table_name);
}

async function listColumns(table: string): Promise<ColumnRow[]> {
	const columns = await prisma.$queryRawUnsafe<ColumnRow[]>(
		`SELECT column_name, data_type
		FROM information_schema.columns
		WHERE table_schema = '${SCHEMA}' AND table_name = $1
		ORDER BY ordinal_position`,
		table,
	);
	return columns;
}

const dir = process.argv[2] ?? "exports";
const tables = await listTables();
if (tables.length > 0) {
	await prisma.$transaction(async (tx) => {
		await tx.$executeRawUnsafe(
			`TRUNCATE TABLE ${tables.map((t) => `"${t}"`).join(", ")} CASCADE`,
		);
	});
	console.log(`Truncated ${tables.length} table(s).`);
}
await prisma.$executeRawUnsafe(`SET session_replication_role = replica`);

for (const file of readdirSync(dir)
	.filter((f) => f.endsWith(".csv"))
	.sort()) {
	const table = file.replace(/\.csv$/, "");
	const columns = await listColumns(table);
	if (columns.length === 0) continue;

	const rows = parseCsv(await Bun.file(`${dir}/${file}`).text());
	const data: Record<string, unknown>[] = [];
	for (const row of rows.slice(1)) {
		const entry: Record<string, unknown> = {};
		columns.forEach((col, i) => {
			entry[toCamelCase(col.column_name)] = convertValue(
				col.data_type,
				row[i] ?? "",
			);
		});
		data.push(entry);
	}

	const delegateKey = toCamelCase(table);
	const delegate = (prisma as unknown as Record<string, InsertDelegate>)[
		delegateKey
	];
	if (!delegate) {
		console.log(`${table}: skipped (no prisma delegate)`);
		continue;
	}
	for (const entry of data) {
		await delegate.create({ data: entry });
	}
	console.log(`${table}: imported ${data.length} row(s)`);
}

await prisma.$disconnect();

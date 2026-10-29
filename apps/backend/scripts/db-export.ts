import { mkdir, writeFile } from "node:fs/promises";

import { toCsv } from "@lib/ingest/csv";
import { prisma } from "@lib/prisma";

/* NOTE: dev-only whole-database CSV export (`just db-export` / `bun run db:export`).
 * One file per discovered table, header row + all rows — shaped for later seeding
 * round-trips (the `just db-inject` additive-upsert pattern).
 * Dev-only by construction: wired to the dev DATABASE_URL via .env.local, never a
 * prod path.
 * NOTE: tables are discovered live from information_schema (public schema, BASE
 * TABLEs, `_`-prefixed internals like `_prisma_migrations` skipped). */

const SCHEMA = "public";

type TableRow = { table_name: string };
type ColumnRow = { column_name: string };

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

async function listColumns(table: string): Promise<string[]> {
	const columns = await prisma.$queryRawUnsafe<ColumnRow[]>(
		`SELECT column_name
		FROM information_schema.columns
		WHERE table_schema = '${SCHEMA}' AND table_name = $1
		ORDER BY ordinal_position`,
		table,
	);
	return columns.map((c) => c.column_name);
}

function toCell(value: unknown): string {
	if (value === null || value === undefined) return "";
	if (value instanceof Date) return value.toISOString();
	if (typeof value === "object") {
		// Json / nested values serialize as JSON; class instances (e.g. Prisma
		// Decimal) stringify via their toString instead of becoming "{}"
		const proto = Object.getPrototypeOf(value);
		return proto === Object.prototype || proto === null
			? JSON.stringify(value)
			: String(value);
	}
	return String(value);
}

const outDir = process.argv[2] ?? "exports";
await mkdir(outDir, { recursive: true });

const tables = await listTables();
for (const table of tables) {
	const columns = await listColumns(table);
	if (columns.length === 0) continue;

	const rows = (await prisma.$queryRawUnsafe(
		`SELECT * FROM "public"."${table.replace(/"/g, '""')}"`,
	)) as Array<Record<string, unknown>>;

	const csv = toCsv(
		columns,
		rows.map((row) => columns.map((column) => toCell(row[column]))),
	);
	await writeFile(`${outDir}/${table}.csv`, csv, "utf8");
	console.log(`${table}: ${rows.length} row(s) -> ${outDir}/${table}.csv`);
}

await prisma.$disconnect();
console.log(`Exported database tables to ${outDir}.`);

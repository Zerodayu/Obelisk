import { readdirSync } from "node:fs";

import { parseCsv } from "@lib/ingest/csv";
import { prisma } from "@lib/prisma";

/* NOTE: dev-only whole-database CSV import (`just db-import <dir>`) — adds the
 * per-table CSVs in `<dir>` on top of the existing data, overwriting rows that
 * collide via upsert (the export side: `just db-export`).
 * Dev-only by construction: wired to the dev DATABASE_URL via .env.local, never
 * a prod path. */

const SCHEMA = "public";

type ColumnRow = { column_name: string; data_type: string };

type InsertDelegate = {
	create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
	upsert: (args: {
		where: Record<string, unknown>;
		create: Record<string, unknown>;
		update: Record<string, unknown>;
	}) => Promise<unknown>;
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

async function listPrimaryKeys(table: string): Promise<string[]> {
	const pks = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
		`SELECT kcu.column_name
		FROM information_schema.table_constraints tc
		JOIN information_schema.key_column_usage kcu
		  ON tc.constraint_name = kcu.constraint_name
		 AND tc.table_schema = kcu.table_schema
		WHERE tc.table_schema = '${SCHEMA}'
		  AND tc.table_name = $1
		  AND tc.constraint_type = 'PRIMARY KEY'
		ORDER BY kcu.ordinal_position`,
		table,
	);
	return pks.map((p) => p.column_name);
}

const dir = process.argv[2] ?? "exports";

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
	const pks = await listPrimaryKeys(table);
	for (const entry of data) {
		const where: Record<string, unknown> = {};
		for (const pk of pks) {
			where[toCamelCase(pk)] = entry[toCamelCase(pk)];
		}
		if (Object.keys(where).length > 0) {
			await delegate.upsert({ where, create: entry, update: entry });
		} else {
			await delegate.create({ data: entry });
		}
	}
	console.log(`${table}: imported ${data.length} row(s)`);
}

await prisma.$disconnect();

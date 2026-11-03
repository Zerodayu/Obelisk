import { readdirSync } from "node:fs";

import { parseCsv } from "@lib/ingest/csv";
import { prisma } from "@lib/prisma";

/* NOTE: dev-only whole-database CSV import (`just db-import <dir>`) — adds the
 * per-table CSVs in `<dir>` on top of the existing data: rows are upserted by
 * primary key, and rows that collide on a natural (unique) key overwrite the
 * row already in the db instead of failing. The export side is `just db-export`.
 * Dev-only by construction: wired to the dev DATABASE_URL via .env.local, never
 * a prod path.
 * NOTE: raw SQL instead of Prisma delegates — the CSVs hold snake_case columns
 * for every table, including ones whose Prisma models nest relations. */

const SCHEMA = "public";

type ColumnRow = { column_name: string; data_type: string };

type Client = typeof prisma;

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
	// json/jsonb: keep the CSV text as-is, postgres casts the parameter
	return text;
}

function quote(ident: string): string {
	return `"${ident.replace(/"/g, '""')}"`;
}

function isUniqueViolation(e: unknown): boolean {
	const code = (e as { code?: string })?.code;
	return code === "P2002" || /23505|UniqueConstraintViolation/.test(String(e));
}

async function listColumns(
	client: Client,
	table: string,
): Promise<ColumnRow[]> {
	const columns = await client.$queryRawUnsafe<ColumnRow[]>(
		`SELECT column_name, data_type
		FROM information_schema.columns
		WHERE table_schema = '${SCHEMA}' AND table_name = $1
		ORDER BY ordinal_position`,
		table,
	);
	return columns;
}

type Constraints = { pk: string[]; uniques: string[][] };

async function listConstraints(
	client: Client,
	table: string,
): Promise<Constraints> {
	const rows = await client.$queryRawUnsafe<
		{
			constraint_name: string;
			constraint_type: string;
			column_name: string;
			ordinal_position: number;
		}[]
	>(
		`SELECT tc.constraint_name, tc.constraint_type, kcu.column_name,
			kcu.ordinal_position
		FROM information_schema.table_constraints tc
		JOIN information_schema.key_column_usage kcu
		  ON tc.constraint_name = kcu.constraint_name
		 AND tc.table_schema = kcu.table_schema
		WHERE tc.table_schema = '${SCHEMA}'
		  AND tc.table_name = $1
		  AND tc.constraint_type IN ('PRIMARY KEY', 'UNIQUE')
		ORDER BY CASE tc.constraint_type WHEN 'PRIMARY KEY' THEN 0 ELSE 1 END,
			tc.constraint_name, kcu.ordinal_position`,
		table,
	);
	const groups: Record<string, { type: string; cols: string[] }> = {};
	const order: string[] = [];
	for (const r of rows) {
		if (!groups[r.constraint_name]) {
			groups[r.constraint_name] = { type: r.constraint_type, cols: [] };
			order.push(r.constraint_name);
		}
		groups[r.constraint_name].cols.push(r.column_name);
	}
	let pk: string[] = [];
	const uniques: string[][] = [];
	for (const c of order) {
		if (groups[c].type === "PRIMARY KEY") pk = groups[c].cols;
		else uniques.push(groups[c].cols);
	}
	// prisma emits `@@unique` as a plain unique index, not a table constraint
	const indexes = await client.$queryRawUnsafe<
		{ index_name: string; column_name: string; ord: number }[]
	>(
		`SELECT i.relname AS index_name, a.attname AS column_name, k.ord
		FROM pg_index ix
		JOIN pg_class t ON t.oid = ix.indrelid
		JOIN pg_class i ON i.oid = ix.indexrelid
		JOIN pg_namespace n ON n.oid = t.relnamespace
		CROSS JOIN LATERAL unnest(ix.indkey::int2[]) WITH ORDINALITY AS k(attnum, ord)
		JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
		WHERE n.nspname = '${SCHEMA}' AND t.relname = $1
		  AND ix.indisunique AND NOT ix.indisprimary AND ix.indpred IS NULL
		ORDER BY i.relname, k.ord`,
		table,
	);
	const idxGroups: Record<string, string[]> = {};
	for (const r of indexes) {
		(idxGroups[r.index_name] ??= []).push(r.column_name);
	}
	for (const cols of Object.values(idxGroups)) {
		const known = uniques.some(
			(u) => u.length === cols.length && u.every((c, i) => c === cols[i]),
		);
		if (!known) uniques.push(cols);
	}
	return { pk, uniques };
}

const ORDER: Record<string, number> = {
	department: 0,
	program: 1,
	user: 2,
	academic_term: 3,
	course: 4,
	clo: 5,
	plo: 6,
	peo: 7,
	class_section: 8,
	assessment_item: 9,
	student: 10,
	enrollment: 11,
	account: 12,
	session: 13,
	verification: 14,
	form_type: 15,
	form_submission: 16,
	approval_step: 17,
	clo_to_plo_map: 18,
	plo_to_peo_map: 19,
	computation_run: 20,
	clo_attainment: 21,
	plo_attainment: 22,
	peo_attainment: 23,
	student_score: 24,
	upload_record: 25,
	at_risk_flag: 26,
	audit_log: 27,
	ai_recommendation: 28,
	report_export: 29,
	graduation_cluster: 30,
	graduation_cluster_entry: 31,
	gap_row: 32,
	cqi_entry: 33,
	ctl_row: 34,
	budget_line_item: 35,
	calendar_event_row: 36,
	capstone_panelist_row: 37,
	cqi_implement_row: 38,
	exhibition_guest_row: 39,
	mid_cycle_cohort_row: 40,
	portfolio_criterion_row: 41,
	portfolio_roadmap_row: 42,
	portfolio_rubric_row: 43,
	resource_item_row: 44,
	plo_target_row: 45,
	plo_directory_row: 46,
	course_clo_target_row: 47,
	curriculum_course_row: 48,
	curriculum_map_cell: 49,
};

const dir = process.argv[2] ?? "exports";

// export id -> id already in the db (rows that collided on a natural key)
const idMap = new Map<string, string>();

async function importRow(
	table: string,
	entry: Record<string, unknown>,
	columns: string[],
	pk: string[],
	uniques: string[][],
): Promise<void> {
	const cols = columns.filter((c) => entry[toCamelCase(c)] !== undefined);
	const values = cols.map((c) => entry[toCamelCase(c)]);
	const setCols = cols.filter((c) => !pk.includes(c));
	const hasPk = pk.length > 0 && pk.every((c) => cols.includes(c));
	const conflict = hasPk
		? `ON CONFLICT (${pk.map(quote).join(", ")}) DO UPDATE SET ${setCols
				.map((c) => `${quote(c)} = EXCLUDED.${quote(c)}`)
				.join(", ")}`
		: "ON CONFLICT DO NOTHING";
	try {
		await prisma.$executeRawUnsafe(
			`INSERT INTO ${quote(table)} (${cols.map(quote).join(", ")})
			VALUES (${cols.map((_, i) => `$${i + 1}`).join(", ")}) ${conflict}`,
			...values,
		);
		return;
	} catch (e) {
		if (/23502|NullConstraintViolation/.test(String(e))) {
			// exported row predates a later NOT NULL column; the current schema can't hold it
			console.log(`${table}: skipped row (null constraint)`);
			return;
		}
		if (!isUniqueViolation(e)) throw e;
	}
	// collision on a non-primary unique key: overwrite the row already in the db
	for (const uc of uniques) {
		if (!uc.every((c) => cols.includes(c))) continue;
		const where = uc.map((c, i) => `${quote(c)} = $${i + 1}`).join(" AND ");
		const found = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
			`SELECT ${pk.map(quote).join(", ")} FROM ${quote(table)}
			WHERE ${where} LIMIT 1`,
			...uc.map((c) => entry[toCamelCase(c)]),
		);
		if (found.length === 0) continue;
		const existing = found[0] as Record<string, unknown>;
		if (typeof entry.id === "string" && existing.id !== undefined) {
			idMap.set(entry.id, String(existing.id));
		}
		if (setCols.length > 0) {
			const setSql = setCols
				.map((c, i) => `${quote(c)} = $${i + 1}`)
				.join(", ");
			const whereSql = pk
				.map((c, i) => `${quote(c)} = $${setCols.length + i + 1}`)
				.join(" AND ");
			await prisma.$executeRawUnsafe(
				`UPDATE ${quote(table)} SET ${setSql} WHERE ${whereSql}`,
				...setCols.map((c) => entry[toCamelCase(c)]),
				...pk.map((c) => existing[c]),
			);
		}
		return;
	}
	console.log(`${table}: skipped row (unique constraint)`);
}

const files = readdirSync(dir)
	.filter((f) => f.endsWith(".csv"))
	.sort((a, b) => {
		const ta = a.replace(/\.csv$/, "").replace(/^users$/, "user");
		const tb = b.replace(/\.csv$/, "").replace(/^users$/, "user");
		const ia = ORDER[ta] ?? 999;
		const ib = ORDER[tb] ?? 999;
		if (ia !== ib) return ia - ib;
		return a.localeCompare(b);
	});

for (const file of files) {
	const table = file.replace(/\.csv$/, "").replace(/^users$/, "user");
	const columns = await listColumns(prisma, table);
	if (columns.length === 0) continue;

	const rows = parseCsv(await Bun.file(`${dir}/${file}`).text());
	if (rows.length === 0) continue;
	const header = rows[0] ?? [];
	const headerIndex: Record<string, number> = {};
	header.forEach((h, i) => {
		headerIndex[h.trim()] = i;
	});

	const { pk, uniques } = await listConstraints(prisma, table);
	let count = 0;
	for (const row of rows.slice(1)) {
		const entry: Record<string, unknown> = {};
		for (const col of columns) {
			const i = headerIndex[col.column_name];
			const cell = i !== undefined && i < row.length ? (row[i] ?? "") : "";
			const value = convertValue(col.data_type, cell);
			entry[toCamelCase(col.column_name)] =
				typeof value === "string" ? (idMap.get(value) ?? value) : value;
		}
		await importRow(
			table,
			entry,
			columns.map((c) => c.column_name),
			pk,
			uniques,
		);
		count += 1;
	}
	console.log(`${table}: imported ${count} row(s)`);
}

await prisma.$disconnect();

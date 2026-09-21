"use server";

import { ApiError } from "@/lib/api-client";
import { isDevMode } from "@/lib/dev-mode";
import { SAMPLE_CLASS_SECTIONS } from "@/lib/store/atoms/academic";
import { actionApi } from "@/server/api-client";

export type ActionResult<TData = void> =
	| { ok: true; data: TData }
	| { ok: false; error: string };

function errorMessage(err: unknown, fallback: string): string {
	return err instanceof ApiError ? err.message : fallback;
}

export interface AcademicProgram {
	id: string;
	code: string;
	name: string;
}

export interface AcademicTerm {
	id: string;
	schoolYear: string;
	semester: string;
	isActive: boolean;
	startDate: string | null;
	endDate: string | null;
}

export interface ClassSection {
	id: string;
	sectionCode: string;
	course: { id: string; code: string; title: string };
	term: { id: string; schoolYear: string; semester: string };
	faculty: { id: string; name: string } | null;
}

export async function listPrograms(): Promise<
	ActionResult<AcademicProgram[]>
> {
	if (isDevMode) {
		return {
			ok: true,
			data: [
				{ id: "prog-1", code: "BSCE", name: "Bachelor of Science in Civil Engineering" },
				{ id: "prog-2", code: "BSCPE", name: "Bachelor of Science in Computer Engineering" },
				{ id: "prog-3", code: "BSIT", name: "Bachelor of Science in Information Technology" },
				{ id: "prog-4", code: "BSBA", name: "Bachelor of Science in Business Administration" },
				{ id: "prog-5", code: "BSA", name: "Bachelor of Science in Accountancy" },
				{ id: "prog-6", code: "BSN", name: "Bachelor of Science in Nursing" },
			],
		};
	}
	try {
		const data = await actionApi.get<AcademicProgram[]>(
			"/academic/programs",
		);
		return { ok: true, data };
	} catch (err) {
		return {
			ok: false,
			error: errorMessage(err, "Failed to load programs."),
		};
	}
}

export async function listTerms(): Promise<ActionResult<AcademicTerm[]>> {
	if (isDevMode) {
		return {
			ok: true,
			data: [
				{
					id: "term-1",
					schoolYear: "2025-2026",
					semester: "1",
					isActive: true,
					startDate: "2025-08-04",
					endDate: "2025-12-12",
				},
				{
					id: "term-2",
					schoolYear: "2024-2025",
					semester: "2",
					isActive: false,
					startDate: "2025-01-06",
					endDate: "2025-05-30",
				},
				{
					id: "term-3",
					schoolYear: "2024-2025",
					semester: "1",
					isActive: false,
					startDate: "2024-08-05",
					endDate: "2024-12-13",
				},
			],
		};
	}
	try {
		const data = await actionApi.get<AcademicTerm[]>("/academic/terms");
		return { ok: true, data };
	} catch (err) {
		return {
			ok: false,
			error: errorMessage(err, "Failed to load terms."),
		};
	}
}

export async function listClassSections(
	programId?: string,
	termId?: string,
): Promise<ActionResult<ClassSection[]>> {
	if (isDevMode) {
		let filtered = SAMPLE_CLASS_SECTIONS;
		if (programId) {
			// Map program code prefix to course codes for filtering
			const programCoursePrefixes: Record<string, string[]> = {
				"prog-1": ["CE"],    // Civil Engineering
				"prog-2": ["CPE"],   // Computer Engineering
				"prog-3": ["IT"],    // Information Technology
				"prog-4": ["BA"],    // Business Administration
				"prog-5": ["ACC"],   // Accountancy
				"prog-6": ["NUR"],   // Nursing
			};
			const prefixes = programCoursePrefixes[programId] ?? [];
			if (prefixes.length > 0) {
				filtered = filtered.filter((cs) =>
					prefixes.some((prefix) => cs.course.code.startsWith(prefix)),
				);
			}
		}
		if (termId) {
			filtered = filtered.filter((cs) => cs.term.id === termId);
		}
		return { ok: true, data: filtered };
	}
	try {
		const params = new URLSearchParams();
		if (programId) params.set("programId", programId);
		if (termId) params.set("termId", termId);
		const qs = params.toString();
		const data = await actionApi.get<ClassSection[]>(
			`/academic/class-sections${qs ? `?${qs}` : ""}`,
		);
		return { ok: true, data };
	} catch (err) {
		return {
			ok: false,
			error: errorMessage(err, "Failed to load class sections."),
		};
	}
}

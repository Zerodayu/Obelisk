"use server";

import { ApiError } from "@/lib/api-client";
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

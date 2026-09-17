/**
 * Academic reference data atoms — programs, terms, class sections.
 *
 * Auto-fetches on first subscription and caches for the session.
 * Used by ProgramSelect, TermSelect, and ClassSectionSelect components.
 */

import { api } from "@/lib/api-client";
import { atomWithAsyncData } from "@/lib/store/async-atom";

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

export const {
	dataAtom: programsAtom,
	refreshAtom: refreshPrograms,
} = atomWithAsyncData<AcademicProgram[]>([], (_get, signal) =>
	api.get<AcademicProgram[]>("/academic/programs", { signal, credentials: true }),
);

export const {
	dataAtom: termsAtom,
	refreshAtom: refreshTerms,
} = atomWithAsyncData<AcademicTerm[]>([], (_get, signal) =>
	api.get<AcademicTerm[]>("/academic/terms", { signal, credentials: true }),
);

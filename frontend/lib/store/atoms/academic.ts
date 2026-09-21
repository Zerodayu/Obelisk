/**
 * Academic reference data atoms — programs, terms, class sections.
 *
 * Auto-fetches on first subscription and caches for the session.
 * Used by ProgramSelect, TermSelect, and ClassSectionSelect components.
 *
 * In DEVELOPMENT mode, uses sample data so dropdowns show realistic content
 * without requiring the backend to have seed data.
 */

import { api } from "@/lib/api-client";
import { isDevMode } from "@/lib/dev-mode";
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

// ---------------------------------------------------------------------------
// Sample data for development mode
// ---------------------------------------------------------------------------

const SAMPLE_PROGRAMS: AcademicProgram[] = [
	{ id: "prog-1", code: "BSCE", name: "Bachelor of Science in Civil Engineering" },
	{ id: "prog-2", code: "BSCPE", name: "Bachelor of Science in Computer Engineering" },
	{ id: "prog-3", code: "BSIT", name: "Bachelor of Science in Information Technology" },
	{ id: "prog-4", code: "BSBA", name: "Bachelor of Science in Business Administration" },
	{ id: "prog-5", code: "BSA", name: "Bachelor of Science in Accountancy" },
	{ id: "prog-6", code: "BSN", name: "Bachelor of Science in Nursing" },
];

const SAMPLE_TERMS: AcademicTerm[] = [
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
	{
		id: "term-4",
		schoolYear: "2023-2024",
		semester: "2",
		isActive: false,
		startDate: "2024-01-08",
		endDate: "2024-05-24",
	},
	{
		id: "term-5",
		schoolYear: "2023-2024",
		semester: "1",
		isActive: false,
		startDate: "2023-08-07",
		endDate: "2023-12-15",
	},
];

export const SAMPLE_CLASS_SECTIONS: ClassSection[] = [
	{
		id: "cs-1",
		sectionCode: "A",
		course: { id: "c-1", code: "CE101", title: "Engineering Mechanics" },
		term: { id: "term-1", schoolYear: "2025-2026", semester: "1" },
		faculty: { id: "f-1", name: "Dr. Juan Dela Cruz" },
	},
	{
		id: "cs-2",
		sectionCode: "B",
		course: { id: "c-1", code: "CE101", title: "Engineering Mechanics" },
		term: { id: "term-1", schoolYear: "2025-2026", semester: "1" },
		faculty: { id: "f-2", name: "Prof. Maria Santos" },
	},
	{
		id: "cs-3",
		sectionCode: "A",
		course: { id: "c-2", code: "CPE201", title: "Data Structures and Algorithms" },
		term: { id: "term-1", schoolYear: "2025-2026", semester: "1" },
		faculty: { id: "f-3", name: "Dr. Jose Reyes" },
	},
	{
		id: "cs-4",
		sectionCode: "A",
		course: { id: "c-3", code: "IT301", title: "Systems Analysis and Design" },
		term: { id: "term-1", schoolYear: "2025-2026", semester: "1" },
		faculty: { id: "f-4", name: "Prof. Ana Garcia" },
	},
	{
		id: "cs-5",
		sectionCode: "A",
		course: { id: "c-4", code: "BA101", title: "Principles of Management" },
		term: { id: "term-2", schoolYear: "2024-2025", semester: "2" },
		faculty: { id: "f-5", name: "Dr. Pedro Mendoza" },
	},
];

// ---------------------------------------------------------------------------
// Atoms — mock data in dev mode, real fetch in production
// ---------------------------------------------------------------------------

export const {
	dataAtom: programsAtom,
	refreshAtom: refreshPrograms,
} = atomWithAsyncData<AcademicProgram[]>(
	SAMPLE_PROGRAMS,
	(_get, signal) => {
		if (isDevMode) return Promise.resolve(SAMPLE_PROGRAMS);
		return api.get<AcademicProgram[]>("/academic/programs", { signal, credentials: true });
	},
);

export const {
	dataAtom: termsAtom,
	refreshAtom: refreshTerms,
} = atomWithAsyncData<AcademicTerm[]>(
	SAMPLE_TERMS,
	(_get, signal) => {
		if (isDevMode) return Promise.resolve(SAMPLE_TERMS);
		return api.get<AcademicTerm[]>("/academic/terms", { signal, credentials: true });
	},
);

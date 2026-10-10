/**
 * Academic reference data atoms — programs, terms, class sections.
 *
 * Auto-fetches on first subscription and caches for the session.
 * Used by ProgramSelect, TermSelect, and ClassSectionSelect components.
 *
 * In DEVELOPMENT mode the fetchers resolve sample data so dropdowns show
 * realistic content without requiring the backend to have seed data. Outside
 * dev mode they start empty and hold only what the backend returned — a failed
 * or pending fetch renders an empty select, never fabricated programs/terms.
 */

import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { api } from "@/lib/api-client";
import { isDevMode } from "@/lib/dev-mode";
import { atomWithAsyncData } from "@/lib/store/async-atom";

export interface AcademicProgram {
  id: string;
  code: string;
  name: string;
}

/** A college/department row (`GET /academic/departments`) — dean scope. */
export interface AcademicDepartment {
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
  // NOTE: programId rides on the course so picking a section can back-fill the
  // program in the global context (see setClassSectionContextAtom).
  course: { id: string; code: string; title: string; programId: string };
  term: { id: string; schoolYear: string; semester: string };
  faculty: { id: string; name: string } | null;
}

// ---------------------------------------------------------------------------
// Sample data for development mode
// ---------------------------------------------------------------------------

const SAMPLE_PROGRAMS: AcademicProgram[] = [
  {
    id: "prog-1",
    code: "BSCE",
    name: "Bachelor of Science in Civil Engineering",
  },
  {
    id: "prog-2",
    code: "BSCPE",
    name: "Bachelor of Science in Computer Engineering",
  },
  {
    id: "prog-3",
    code: "BSIT",
    name: "Bachelor of Science in Information Technology",
  },
  {
    id: "prog-4",
    code: "BSBA",
    name: "Bachelor of Science in Business Administration",
  },
  { id: "prog-5", code: "BSA", name: "Bachelor of Science in Accountancy" },
  { id: "prog-6", code: "BSN", name: "Bachelor of Science in Nursing" },
];

/** Dev-mode stand-in for `GET /academic/departments` (mirrors the seed's CITE). */
export const SAMPLE_DEPARTMENTS: AcademicDepartment[] = [
  { id: "dept-1", code: "CITE", name: "CITE" },
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
    course: {
      id: "c-1",
      code: "CE101",
      title: "Engineering Mechanics",
      programId: "prog-1",
    },
    term: { id: "term-1", schoolYear: "2025-2026", semester: "1" },
    faculty: { id: "f-1", name: "Dr. Juan Dela Cruz" },
  },
  {
    id: "cs-2",
    sectionCode: "B",
    course: {
      id: "c-1",
      code: "CE101",
      title: "Engineering Mechanics",
      programId: "prog-1",
    },
    term: { id: "term-1", schoolYear: "2025-2026", semester: "1" },
    faculty: { id: "f-2", name: "Prof. Maria Santos" },
  },
  {
    id: "cs-3",
    sectionCode: "A",
    course: {
      id: "c-2",
      code: "CPE201",
      title: "Data Structures and Algorithms",
      programId: "prog-2",
    },
    term: { id: "term-1", schoolYear: "2025-2026", semester: "1" },
    faculty: { id: "f-3", name: "Dr. Jose Reyes" },
  },
  {
    id: "cs-4",
    sectionCode: "A",
    course: {
      id: "c-3",
      code: "IT301",
      title: "Systems Analysis and Design",
      programId: "prog-3",
    },
    term: { id: "term-1", schoolYear: "2025-2026", semester: "1" },
    faculty: { id: "f-4", name: "Prof. Ana Garcia" },
  },
  {
    id: "cs-5",
    sectionCode: "A",
    course: {
      id: "c-4",
      code: "BA101",
      title: "Principles of Management",
      programId: "prog-4",
    },
    term: { id: "term-2", schoolYear: "2024-2025", semester: "2" },
    faculty: { id: "f-5", name: "Dr. Pedro Mendoza" },
  },
];

// ---------------------------------------------------------------------------
// Atoms — sample data in dev mode, live fetch (empty seed) otherwise
// ---------------------------------------------------------------------------

export const { dataAtom: programsAtom, refreshAtom: refreshPrograms } =
  atomWithAsyncData<AcademicProgram[]>(
    isDevMode ? SAMPLE_PROGRAMS : [],
    (_get, signal) => {
      if (isDevMode) return Promise.resolve(SAMPLE_PROGRAMS);
      return api.get<AcademicProgram[]>("/academic/programs", {
        signal,
        credentials: true,
      });
    },
  );

export const { dataAtom: termsAtom, refreshAtom: refreshTerms } =
  atomWithAsyncData<AcademicTerm[]>(
    isDevMode ? SAMPLE_TERMS : [],
    (_get, signal) => {
      if (isDevMode) return Promise.resolve(SAMPLE_TERMS);
      return api.get<AcademicTerm[]>("/academic/terms", {
        signal,
        credentials: true,
      });
    },
  );

// ---------------------------------------------------------------------------
// Global academic context — one selection shared by every form in the app
// ---------------------------------------------------------------------------

/**
 * App-wide academic context, picked once on the dashboard
 * (`AcademicContextPicker`) and consumed by every form instead of per-form
 * selectors. Persisted in localStorage so the selection survives reloads.
 */
export const selectedProgramIdAtom = atomWithStorage<string>(
  "obelisk.ctx.programId",
  "",
);

export const selectedTermIdAtom = atomWithStorage<string>(
  "obelisk.ctx.termId",
  "",
);

/**
 * Target class section of the global context — also binds the class-record
 * upload and the `clo_raw_data` workflow strip (`GET/POST /ingest/clo-raw-data/*`).
 * Was `selectedClassSectionIdAtom` in `atoms/ingest.ts`; re-exported there.
 */
export const selectedClassSectionIdAtom = atomWithStorage<string>(
  "obelisk.ctx.classSectionId",
  "",
);

/**
 * Set the whole context from one picked class section — the section implies
 * its program (via course) and term, so the dashboard picker back-fills all
 * three atoms in one write.
 */
export const setClassSectionContextAtom = atom(
  null,
  (_get, set, section: ClassSection) => {
    set(selectedProgramIdAtom, section.course.programId);
    set(selectedTermIdAtom, section.term.id);
    set(selectedClassSectionIdAtom, section.id);
  },
);

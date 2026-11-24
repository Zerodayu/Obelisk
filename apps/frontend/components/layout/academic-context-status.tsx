"use client";

import { useAtomValue } from "jotai";

import {
	programsAtom,
	selectedClassSectionAtom,
	selectedClassSectionIdAtom,
	selectedProgramIdAtom,
	selectedTermIdAtom,
	termsAtom,
} from "@/lib/store/atoms/academic";

/** Compact term label, e.g. "2025-2026 · 1st Sem". */
function termLabel(term: { schoolYear: string; semester: string }): string {
	const semester =
		term.semester === "1"
			? "1st Sem"
			: term.semester === "2"
				? "2nd Sem"
				: `Sem ${term.semester}`;
	return `${term.schoolYear} · ${semester}`;
}

/**
 * Read-only status of the global academic context (program · term · section),
 * rendered in the shared header so every screen shows what it is scoped to.
 * Resolves program/term names from the cached reference lists and the section
 * from the full section atom written when it was picked — no per-page fetch.
 */
export function AcademicContextStatus() {
	const programId = useAtomValue(selectedProgramIdAtom);
	const termId = useAtomValue(selectedTermIdAtom);
	const sectionId = useAtomValue(selectedClassSectionIdAtom);
	const section = useAtomValue(selectedClassSectionAtom);

	const programs = useAtomValue(programsAtom);
	const terms = useAtomValue(termsAtom);

	const program = programs.find((p) => p.id === programId);
	const term = terms.find((t) => t.id === termId);

	const parts: string[] = [];
	if (programId && program) parts.push(program.code);
	if (termId && term) parts.push(termLabel(term));
	if (sectionId && section) {
		parts.push(`${section.course.code} — ${section.sectionCode}`);
	}

	return (
		<div className="text-muted-foreground ml-auto hidden shrink-0 text-xs sm:block">
			{parts.length > 0 ? parts.join("  ·  ") : "No context selected"}
		</div>
	);
}

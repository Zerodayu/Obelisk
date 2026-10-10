"use client";

import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useState } from "react";

import { ClassSectionSelect } from "@/components/ui/class-section-select";
import { ProgramSelect } from "@/components/ui/program-select";
import { TermSelect } from "@/components/ui/term-select";
import {
	selectedClassSectionIdAtom,
	selectedProgramIdAtom,
	setClassSectionContextAtom,
	selectedTermIdAtom,
} from "@/lib/store/atoms/academic";

/**
 * The app's single academic-context picker, rendered on the dashboard: one
 * Program → Term → Class-section chain bound to the global atoms that every
 * form reads in place of its own selectors. Picking a class section back-fills
 * program + term (the section implies both), so "select one file, it applies
 * everywhere" works — the class-record upload binds to the same section atom.
 */
export function AcademicContextPicker() {
	// NOTE: the atoms are localStorage-backed — SSR renders the empty state, so
	// the selects mount client-side only (same pattern as ClassRecordUpload).
	const [isMounted, setIsMounted] = useState(false);
	useEffect(() => {
		setIsMounted(true);
	}, []);

	const programId = useAtomValue(selectedProgramIdAtom);
	const termId = useAtomValue(selectedTermIdAtom);
	const classSectionId = useAtomValue(selectedClassSectionIdAtom);

	const setProgramId = useSetAtom(selectedProgramIdAtom);
	const setTermId = useSetAtom(selectedTermIdAtom);
	const setClassSectionId = useSetAtom(selectedClassSectionIdAtom);
	const setSectionContext = useSetAtom(setClassSectionContextAtom);

	if (!isMounted) return null;

	return (
		<section className="bg-card space-y-3 rounded-xl border p-4 shadow-sm">
			<div>
				<h3 className="text-sm font-semibold">Academic Context</h3>
				<p className="text-muted-foreground text-xs">
					Shared by every form — pick once and all forms inherit it.
				</p>
			</div>
			<div className="grid gap-3 sm:grid-cols-3">
				<ProgramSelect
					className="w-full"
					value={programId}
					onValueChange={(value) => {
						// NOTE: cascading clears — a new program/term invalidates the previously picked section.
						setProgramId(value);
						setTermId("");
						setClassSectionId("");
					}}
					placeholder="Program"
				/>
				<TermSelect
					className="w-full"
					value={termId}
					onValueChange={(value) => {
						setTermId(value);
						setClassSectionId("");
					}}
					placeholder="Term"
				/>
				<ClassSectionSelect
					className="w-full"
					value={classSectionId}
					onValueChange={setClassSectionId}
					onSectionChange={setSectionContext}
					programId={programId || undefined}
					termId={termId || undefined}
					// No filters yet → show every unit-scoped section so a single pick can set the whole context.
					loadAll={!programId && !termId}
					placeholder="Class section"
				/>
			</div>
		</section>
	);
}

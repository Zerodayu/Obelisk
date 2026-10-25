"use client";

import { useAtomValue, useSetAtom } from "jotai";
import { PlusIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { AddClassSectionDialog } from "@/components/dashboard/add-class-section-dialog";
import { Button } from "@/components/ui/button";
import { ClassSectionSelect } from "@/components/ui/class-section-select";
import { ProgramSelect } from "@/components/ui/program-select";
import { TermSelect } from "@/components/ui/term-select";
import { canAccess } from "@/lib/role-access";
import {
	refreshTerms,
	selectedClassSectionIdAtom,
	selectedProgramIdAtom,
	setClassSectionContextAtom,
	selectedTermIdAtom,
} from "@/lib/store/atoms/academic";
import { userAtom } from "@/lib/store/atoms/user";

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
	const user = useAtomValue(userAtom);

	const setProgramId = useSetAtom(selectedProgramIdAtom);
	const setTermId = useSetAtom(selectedTermIdAtom);
	const setClassSectionId = useSetAtom(selectedClassSectionIdAtom);
	const setSectionContext = useSetAtom(setClassSectionContextAtom);
	const refreshTermList = useSetAtom(refreshTerms);

	const [addSectionOpen, setAddSectionOpen] = useState(false);
	// NOTE: bumping this key remounts the section select, which is the only way
	// it refetches after a section is created (it fetches on mount/filter change).
	const [sectionsVersion, setSectionsVersion] = useState(0);

	// A bounded role with no program on file sees no sections and must not be
	// offered a create button — the backend refuses it (own scope).
	const canAddSection =
		canAccess(user?.role, "manageClassSections") &&
		(user?.role === "system_admin" || !!user?.programId);

	if (!isMounted) return null;

	return (
		<section className="bg-card space-y-3 rounded-xl border p-4 shadow-sm">
			<div className="flex flex-wrap items-start justify-between gap-2">
				<div>
					<h3 className="text-sm font-semibold">Academic Context</h3>
					<p className="text-muted-foreground text-xs">
						Shared by every form — pick once and all forms inherit it.
					</p>
				</div>
				{canAddSection && (
					<Button variant="outline" onClick={() => setAddSectionOpen(true)}>
						<PlusIcon /> Add class section
					</Button>
				)}
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
					key={sectionsVersion}
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

			<AddClassSectionDialog
				open={addSectionOpen}
				onOpenChange={setAddSectionOpen}
				onCreated={(section) => {
					// The new section's term may be the one the backend just
					// bootstrapped — refresh the list before selecting it.
					void refreshTermList();
					setSectionContext(section);
					setSectionsVersion((version) => version + 1);
				}}
			/>
		</section>
	);
}

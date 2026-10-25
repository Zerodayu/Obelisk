"use client";

import { useAtomValue, useSetAtom } from "jotai";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { useEffect, useState } from "react";

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogBody,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ProgramSelect } from "@/components/ui/program-select";
import { toast, toastError } from "@/components/ui/toast";
import { refreshPrograms } from "@/lib/store/atoms/academic";
import { userAtom } from "@/lib/store/atoms/user";
import {
	type ClassSection,
	createClassSection,
} from "@/server/actions/academic";

interface CloRow {
	code: string;
	description: string;
}

interface AddClassSectionDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** Fires with the created row so the caller can select it immediately. */
	onCreated: (section: ClassSection) => void;
}

const emptyClo = (): CloRow => ({ code: "", description: "" });

/**
 * Create a class section from the dashboard's academic-context card.
 *
 * Admin picks the program; a faculty/chair section lands in the caller's own
 * program (the backend derives it and enforces the scope). The backend also
 * decides the term (active term) and creates the course + CLOs when missing.
 */
export function AddClassSectionDialog({
	open,
	onOpenChange,
	onCreated,
}: AddClassSectionDialogProps) {
	const user = useAtomValue(userAtom);
	const refreshProgramList = useSetAtom(refreshPrograms);
	const isAdmin = user?.role === "system_admin";

	const [programId, setProgramId] = useState("");
	const [sectionCode, setSectionCode] = useState("");
	const [courseCode, setCourseCode] = useState("");
	const [courseTitle, setCourseTitle] = useState("");
	const [clos, setClos] = useState<CloRow[]>([emptyClo()]);
	const [submitting, setSubmitting] = useState(false);

	// NOTE: reset on every open; admins may have just created a program in the
	// panel above, so refresh the atom-backed picker.
	useEffect(() => {
		if (!open) return;
		setProgramId("");
		setSectionCode("");
		setCourseCode("");
		setCourseTitle("");
		setClos([emptyClo()]);
		if (isAdmin) void refreshProgramList();
	}, [open, isAdmin, refreshProgramList]);

	async function handleCreate() {
		const section = sectionCode.trim();
		const course = courseCode.trim();
		if (!section || !course) {
			toast.create({
				title: "Section code and course code are required",
				type: "error",
			});
			return;
		}
		if (isAdmin && !programId) {
			toast.create({ title: "Select a program", type: "error" });
			return;
		}

		// NOTE: drop fully blank rows, but refuse half-filled ones — a CLO with a
		// code and no description would be persisted as a blank outcome.
		const cloRows = clos
			.map((clo) => ({
				code: clo.code.trim(),
				description: clo.description.trim(),
			}))
			.filter((clo) => clo.code || clo.description);
		if (cloRows.some((clo) => !clo.code || !clo.description)) {
			toast.create({
				title: "Every CLO needs a code and a description",
				type: "error",
			});
			return;
		}

		setSubmitting(true);
		try {
			const result = await createClassSection({
				sectionCode: section,
				courseCode: course,
				courseTitle: courseTitle.trim() || undefined,
				programId: isAdmin ? programId : undefined,
				clos: cloRows.length > 0 ? cloRows : undefined,
			});
			if (!result.ok) {
				toastError({
					title: "Could not add class section",
					description: result.error,
					scope: "class-section:create",
				});
				return;
			}
			toast.create({
				title: `Section ${result.data.sectionCode} added`,
				type: "success",
			});
			onCreated(result.data);
			onOpenChange(false);
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<AlertDialog
			open={open}
			onOpenChange={(details) => onOpenChange(details.open)}
		>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Add class section</AlertDialogTitle>
					<AlertDialogDescription>
						Added to the active academic term. A new course needs a title and at
						least one CLO so uploads can match scores.
					</AlertDialogDescription>
				</AlertDialogHeader>

				<AlertDialogBody>
					<div className="space-y-4">
						{isAdmin && (
							<Field>
								<FieldLabel>Program</FieldLabel>
								<ProgramSelect
									value={programId}
									onValueChange={setProgramId}
									placeholder="Select program"
								/>
							</Field>
						)}

						<div className="grid gap-3 sm:grid-cols-2">
							<Field>
								<FieldLabel>Section code</FieldLabel>
								<Input
									value={sectionCode}
									onChange={(event) => setSectionCode(event.target.value)}
									placeholder="1A"
								/>
							</Field>
							<Field>
								<FieldLabel>Course code</FieldLabel>
								<Input
									value={courseCode}
									onChange={(event) => setCourseCode(event.target.value)}
									placeholder="IT 101"
								/>
							</Field>
						</div>

						<Field>
							<FieldLabel>Course title</FieldLabel>
							<FieldDescription>
								Only used when the course code is new; an existing course keeps
								its title.
							</FieldDescription>
							<Input
								value={courseTitle}
								onChange={(event) => setCourseTitle(event.target.value)}
								placeholder="Introduction to Computing"
							/>
						</Field>

						<div className="space-y-2 pt-4">
							<div className="flex items-center justify-between gap-2">
								<p className="text-sm font-medium">Course outcomes (CLOs)</p>
								<Button
									variant="outline"
									onClick={() => setClos((prev) => [...prev, emptyClo()])}
								>
									<PlusIcon /> Add CLO
								</Button>
							</div>
							<p className="text-muted-foreground text-xs">
								Required when the course has no CLOs yet. Existing codes are
								left unchanged.
							</p>

							{clos.map((clo, index) => (
								<div
									key={index}
									className="flex items-end justify-center gap-2"
								>
									<Field className="flex-1">
										<FieldLabel>Code</FieldLabel>
										<Input
											value={clo.code}
											onChange={(event) =>
												setClos((prev) =>
													prev.map((row, i) =>
														i === index
															? { ...row, code: event.target.value }
															: row,
													),
												)
											}
											placeholder="CLO1"
										/>
									</Field>
									<Field className="flex-1/2">
										<FieldLabel>Description</FieldLabel>
										<Input
											value={clo.description}
											onChange={(event) =>
												setClos((prev) =>
													prev.map((row, i) =>
														i === index
															? { ...row, description: event.target.value }
															: row,
													),
												)
											}
											placeholder="Apply computing fundamentals"
										/>
									</Field>
									<Button
										variant="ghost"
										size="icon-lg"
										aria-label={`Remove CLO row ${index + 1}`}
										onClick={() =>
											setClos((prev) => prev.filter((_, i) => i !== index))
										}
									>
										<Trash2Icon />
									</Button>
								</div>
							))}
							{clos.length === 0 && (
								<p className="text-muted-foreground text-xs">
									No CLOs — add them if the course is new or has none yet.
								</p>
							)}
						</div>
					</div>
				</AlertDialogBody>

				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction
						isLoading={submitting}
						onClick={() => void handleCreate()}
					>
						Create
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

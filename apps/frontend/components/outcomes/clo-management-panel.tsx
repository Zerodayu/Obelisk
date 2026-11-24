"use client";

import { useAtomValue } from "jotai";
import { useCallback, useEffect, useMemo, useState } from "react";

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
import { Textarea } from "@/components/ui/textarea";
import { toast, toastError } from "@/components/ui/toast";
import { isDevMode } from "@/lib/dev-mode";
import {
	selectedClassSectionIdAtom,
	selectedProgramIdAtom,
	selectedTermIdAtom,
} from "@/lib/store/atoms/academic";
import {
	createClo,
	deleteClo,
	listClassSections,
	listClos,
	listCourses,
	updateClo,
	type CloRecord,
	type CourseRecord,
} from "@/server/actions/academic";

/**
 * Capture-role CLO management. The backend scopes `listCourses`/`listClos` to
 * the caller — a faculty sees only the courses of its own sections, a chair
 * its program — so no program selector is needed here. CLOs are listed grouped
 * by program and course; add/edit sets code + statement, delete is blocked
 * server-side when the CLO is mapped to a PLO or has attainment history.
 */
export function CloManagementPanel() {
	const selectedSectionId = useAtomValue(selectedClassSectionIdAtom);
	const programId = useAtomValue(selectedProgramIdAtom);
	const termId = useAtomValue(selectedTermIdAtom);

	const [courses, setCourses] = useState<CourseRecord[]>([]);
	const [clos, setClos] = useState<CloRecord[]>([]);
	const [loading, setLoading] = useState(false);
	const [dialogOpen, setDialogOpen] = useState(false);
	const [editing, setEditing] = useState<CloRecord | null>(null);
	const [deleteId, setDeleteId] = useState<string | null>(null);

	const [courseId, setCourseId] = useState("");
	const [code, setCode] = useState("");
	const [description, setDescription] = useState("");

	// The selected section's course — when set, CLO management follows it.
	const [activeCourse, setActiveCourse] = useState<CourseRecord | null>(null);

	const fetchData = useCallback(async () => {
		setLoading(true);
		let activeCourseId: string | undefined;
		if (selectedSectionId) {
			const sectionsRes = await listClassSections(programId, termId);
			if (sectionsRes.ok) {
				const section = sectionsRes.data.find(
					(s) => s.id === selectedSectionId,
				);
				if (section) {
					activeCourseId = section.course.id;
					setActiveCourse({
						id: section.course.id,
						code: section.course.code,
						title: section.course.title,
						programId: section.course.programId,
					});
				}
			}
		} else {
			setActiveCourse(null);
		}
		const [coursesRes, closRes] = await Promise.all([
			listCourses(),
			listClos(activeCourseId),
		]);
		if (coursesRes.ok) {
			setCourses(coursesRes.data);
		} else if (!isDevMode) {
			toastError({
				title: "Failed to load courses",
				description: coursesRes.error,
				scope: "clo:courses",
			});
		}
		if (closRes.ok) {
			setClos(closRes.data);
		} else if (!isDevMode) {
			toastError({
				title: "Failed to load CLOs",
				description: closRes.error,
				scope: "clo:list",
			});
		}
		setLoading(false);
	}, [selectedSectionId, programId, termId]);

	useEffect(() => {
		fetchData();
	}, [fetchData]);

	const openCreateDialog = () => {
		setEditing(null);
		setCourseId(activeCourse?.id ?? courses[0]?.id ?? "");
		setCode("");
		setDescription("");
		setDialogOpen(true);
	};

	const openEditDialog = (record: CloRecord) => {
		setEditing(record);
		setCourseId(record.courseId);
		setCode(record.code);
		setDescription(record.description);
		setDialogOpen(true);
	};

	const handleSave = async () => {
		const trimmedCode = code.trim();
		const trimmedDescription = description.trim();

		if (!trimmedCode) {
			toast.create({ title: "CLO code is required", type: "error" });
			return;
		}
		if (!trimmedDescription) {
			toast.create({ title: "CLO statement is required", type: "error" });
			return;
		}

		if (editing) {
			const result = await updateClo(editing.id, {
				code: trimmedCode,
				description: trimmedDescription,
			});
			if (result.ok) {
				toast.create({ title: "CLO updated", type: "success" });
				setDialogOpen(false);
				fetchData();
			} else {
				toastError({
					title: "Update failed",
					description: result.error,
					scope: "clo:update",
				});
			}
		} else {
			if (!courseId) {
				toast.create({ title: "Pick a course", type: "error" });
				return;
			}
			const result = await createClo({
				courseId,
				code: trimmedCode,
				description: trimmedDescription,
			});
			if (result.ok) {
				toast.create({ title: "CLO created", type: "success" });
				setDialogOpen(false);
				fetchData();
			} else {
				toastError({
					title: "Create failed",
					description: result.error,
					scope: "clo:create",
				});
			}
		}
	};

	const handleDelete = async (id: string) => {
		const result = await deleteClo(id);
		if (result.ok) {
			toast.create({ title: "CLO deleted", type: "success" });
			setDeleteId(null);
			fetchData();
		} else {
			toastError({
				title: "Delete failed",
				description: result.error,
				scope: "clo:delete",
			});
		}
	};

	// NOTE: the "Add CLO" dialog needs at least one course to target.
	const courseLabel = (id: string) =>
		courses.find((c) => c.id === id)?.code ?? "";

	// CLOs are separated per program, then per course (each course = a section
	// of the program's CLOs), so every outcome stays under its owning course.
	const groupedClos = useMemo(() => {
		const byProgram = new Map<
			string,
			{
				program: { id: string; code: string; name: string };
				courses: Map<
					string,
					{
						course: { id: string; code: string; title: string };
						clos: CloRecord[];
					}
				>;
			}
		>();
		for (const record of clos) {
			const program = record.course.program;
			let p = byProgram.get(program.id);
			if (!p) {
				p = { program, courses: new Map() };
				byProgram.set(program.id, p);
			}
			const course = {
				id: record.course.id,
				code: record.course.code,
				title: record.course.title,
			};
			let c = p.courses.get(course.id);
			if (!c) {
				c = { course, clos: [] };
				p.courses.set(course.id, c);
			}
			c.clos.push(record);
		}
		return [...byProgram.values()].map((p) => ({
			program: p.program,
			courses: [...p.courses.values()],
		}));
	}, [clos]);

	return (
		<div className="space-y-4">
			<div className="flex justify-end">
				<Button onClick={openCreateDialog} disabled={courses.length === 0}>
					+ Add CLO
				</Button>
			</div>

			{loading ? (
				<div className="text-muted-foreground py-4 text-center text-sm">
					Loading...
				</div>
			) : clos.length === 0 ? (
				<div className="text-muted-foreground rounded-lg border border-dashed p-4 text-center text-sm">
					No CLOs yet. Click "Add CLO" to create the first one.
				</div>
			) : (
				<div className="space-y-6">
					{groupedClos.map(({ program, courses }) => (
						<section key={program.id} className="space-y-3">
							<h3 className="text-sm font-semibold">
								{program.code} — {program.name}
							</h3>
							{courses.map(({ course, clos: courseClos }) => (
								<div key={course.id} className="space-y-1">
									<h4 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
										{course.code} — {course.title}
									</h4>
									<div className="overflow-x-auto rounded-lg border">
										<table className="w-full text-sm">
											<thead>
												<tr className="bg-muted/50 text-muted-foreground border-b text-left">
													<th className="px-3 py-2 font-medium">Code</th>
													<th className="px-3 py-2 font-medium">Statement</th>
													<th className="px-3 py-2 text-right font-medium">
														Actions
													</th>
												</tr>
											</thead>
											<tbody>
												{courseClos.map((record) => (
													<tr
														key={record.id}
														className="hover:bg-muted/30 border-b last:border-0"
													>
														<td className="px-3 py-2 font-medium">
															{record.code}
														</td>
														<td className="text-muted-foreground px-3 py-2">
															{record.description}
														</td>
														<td className="px-3 py-2 text-right">
															<Button
																variant="ghost"
																className="h-7 px-2"
																onClick={() => openEditDialog(record)}
															>
																Edit
															</Button>
															<Button
																variant="ghost"
																className="text-destructive h-7 px-2"
																onClick={() => setDeleteId(record.id)}
															>
																Delete
															</Button>
														</td>
													</tr>
												))}
											</tbody>
										</table>
									</div>
								</div>
							))}
						</section>
					))}
				</div>
			)}

			{/* Create/Edit Dialog */}
			<AlertDialog
				open={dialogOpen}
				onOpenChange={(details) => setDialogOpen(details.open)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							{editing ? "Edit CLO" : "Add CLO"}
						</AlertDialogTitle>
						<AlertDialogDescription>
							{editing
								? "Update this Course Learning Outcome."
								: "Add a Course Learning Outcome to a course."}
						</AlertDialogDescription>
					</AlertDialogHeader>

					<AlertDialogBody>
						<div className="space-y-4">
							<Field>
								<FieldLabel>Course</FieldLabel>
								<FieldDescription>
									{activeCourse && !editing
										? "The selected section's course."
										: editing
											? "The course this CLO belongs to."
											: "Pick the course the CLO belongs to."}
								</FieldDescription>
								{editing || activeCourse ? (
									<Input
										value={
											editing
												? courseLabel(courseId)
												: activeCourse
													? `${activeCourse.code} — ${activeCourse.title}`
													: ""
										}
										disabled
									/>
								) : (
									<select
										value={courseId}
										onChange={(e) => setCourseId(e.target.value)}
										className="border-input bg-background focus:ring-ring w-full rounded-md border px-3 py-2 text-sm"
									>
										<option value="" disabled>
											Select a course
										</option>
										{courses.map((c) => (
											<option key={c.id} value={c.id}>
												{c.code} — {c.title}
											</option>
										))}
									</select>
								)}
							</Field>

							<Field>
								<FieldLabel>Code</FieldLabel>
								<FieldDescription>
									Unique within the course (e.g. CLO1).
								</FieldDescription>
								<Input
									value={code}
									onChange={(e) => setCode(e.target.value)}
									placeholder="CLO1"
								/>
							</Field>

							<Field>
								<FieldLabel>Statement / Description</FieldLabel>
								<FieldDescription>
									The Course Learning Outcome statement.
								</FieldDescription>
								<Textarea
									value={description}
									onChange={(e) => setDescription(e.target.value)}
									placeholder="Describe what students will be able to do..."
								/>
							</Field>
						</div>
					</AlertDialogBody>

					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction onClick={handleSave}>
							{editing ? "Save Changes" : "Create"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			{/* Delete Confirmation Dialog */}
			<AlertDialog
				open={deleteId !== null}
				onOpenChange={(details) => {
					if (!details.open) setDeleteId(null);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete CLO</AlertDialogTitle>
						<AlertDialogDescription>
							Are you sure you want to delete this CLO? CLOs mapped to a PLO or
							with attainment history cannot be deleted. This action cannot be
							undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							onClick={() => deleteId && handleDelete(deleteId)}
						>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}

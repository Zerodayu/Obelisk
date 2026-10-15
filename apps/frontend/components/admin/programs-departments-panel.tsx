"use client";

import { useCallback, useEffect, useState } from "react";

import { SelectDepartment } from "@/components/auth/select-department";
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
import { toast, toastError } from "@/components/ui/toast";
import { isDevMode } from "@/lib/dev-mode";
import type { AcademicDepartment } from "@/lib/store/atoms/academic";
import {
	type AcademicProgram,
	createDepartment,
	createProgram,
	listDepartments,
	listPrograms,
} from "@/server/actions/academic";

/**
 * System-admin reference-data panel: add the institution's departments
 * (colleges) and the programs under them. Programs require a department, so
 * the department list doubles as the program dialog's picker. Reads/writes go
 * through the `manageReferenceData` server actions (system_admin-gated).
 */
export function ProgramsDepartmentsPanel() {
	const [departments, setDepartments] = useState<AcademicDepartment[]>([]);
	const [programs, setPrograms] = useState<AcademicProgram[]>([]);
	const [loading, setLoading] = useState(true);

	const [departmentOpen, setDepartmentOpen] = useState(false);
	const [departmentCode, setDepartmentCode] = useState("");
	const [departmentName, setDepartmentName] = useState("");

	const [programOpen, setProgramOpen] = useState(false);
	const [programCode, setProgramCode] = useState("");
	const [programName, setProgramName] = useState("");
	const [programDepartmentId, setProgramDepartmentId] = useState("");

	const load = useCallback(async () => {
		setLoading(true);
		const [departmentResult, programResult] = await Promise.all([
			listDepartments(),
			listPrograms(),
		]);
		if (departmentResult.ok) {
			setDepartments(departmentResult.data);
		} else if (!isDevMode) {
			toastError({
				title: "Could not load departments",
				description: departmentResult.error,
				scope: "reference-data:departments",
			});
		}
		if (programResult.ok) {
			setPrograms(programResult.data);
		} else if (!isDevMode) {
			toastError({
				title: "Could not load programs",
				description: programResult.error,
				scope: "reference-data:programs",
			});
		}
		setLoading(false);
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	const openDepartmentDialog = () => {
		setDepartmentCode("");
		setDepartmentName("");
		setDepartmentOpen(true);
	};

	const openProgramDialog = () => {
		setProgramCode("");
		setProgramName("");
		setProgramDepartmentId("");
		setProgramOpen(true);
	};

	async function handleCreateDepartment() {
		const code = departmentCode.trim();
		const name = departmentName.trim();
		if (!code || !name) {
			toast.create({ title: "Code and name are required", type: "error" });
			return;
		}

		const result = await createDepartment({ code, name });
		if (result.ok) {
			// NOTE: append the created row instead of re-listing, so it shows
			// without a refresh (and can't be lost to a stale read).
			setDepartments((prev) => [...prev, result.data]);
			toast.create({ title: "Department added", type: "success" });
			setDepartmentOpen(false);
		} else if (isDevMode) {
			setDepartments((prev) => [
				...prev,
				{ id: `dept-${Date.now()}`, code, name },
			]);
			toast.create({ title: "Department added (dev)", type: "success" });
			setDepartmentOpen(false);
		} else {
			toastError({
				title: "Could not add department",
				description: result.error,
				scope: "reference-data:department",
			});
		}
	}

	async function handleCreateProgram() {
		const code = programCode.trim();
		const name = programName.trim();
		if (!code || !name || !programDepartmentId) {
			toast.create({
				title: "Code, name and department are required",
				type: "error",
			});
			return;
		}

		const result = await createProgram({
			code,
			name,
			departmentId: programDepartmentId,
		});
		if (result.ok) {
			// NOTE: append the created row instead of re-listing, so it shows
			// without a refresh (and can't be lost to a stale read).
			setPrograms((prev) => [...prev, result.data]);
			toast.create({ title: "Program added", type: "success" });
			setProgramOpen(false);
		} else if (isDevMode) {
			setPrograms((prev) => [
				...prev,
				{
					id: `prog-${Date.now()}`,
					code,
					name,
					departmentId: programDepartmentId,
				},
			]);
			toast.create({ title: "Program added (dev)", type: "success" });
			setProgramOpen(false);
		} else {
			toastError({
				title: "Could not add program",
				description: result.error,
				scope: "reference-data:program",
			});
		}
	}

	const departmentCodeFor = (id: string) =>
		departments.find((department) => department.id === id)?.code ?? "—";

	return (
		<section className="bg-card rounded-xl border p-6 shadow-sm">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<div>
					<h3 className="text-base font-semibold">
						Programs &amp; departments
					</h3>
					<p className="text-muted-foreground text-xs">
						Departments group programs; every program belongs to one.
					</p>
				</div>
				<div className="flex gap-2">
					<Button
						disabled={loading}
						onClick={openDepartmentDialog}
						type="button"
						variant="outline"
					>
						Add department
					</Button>
					<Button
						disabled={loading || departments.length === 0}
						onClick={openProgramDialog}
						type="button"
					>
						Add program
					</Button>
				</div>
			</div>

			<div className="mt-4 grid gap-6 lg:grid-cols-2">
				<div>
					<h4 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
						Departments
					</h4>
					{loading ? (
						<p className="text-muted-foreground mt-3 text-sm">Loading…</p>
					) : departments.length === 0 ? (
						<p className="text-muted-foreground mt-3 text-sm">
							No departments yet — add one before creating programs.
						</p>
					) : (
						<ul className="divide-border mt-2 divide-y">
							{departments.map((department) => (
								<li
									key={department.id}
									className="flex items-center gap-3 py-2"
								>
									<span className="text-sm font-medium">{department.code}</span>
									<span className="text-muted-foreground truncate text-sm">
										{department.name}
									</span>
								</li>
							))}
						</ul>
					)}
				</div>

				<div>
					<h4 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
						Programs
					</h4>
					{loading ? (
						<p className="text-muted-foreground mt-3 text-sm">Loading…</p>
					) : programs.length === 0 ? (
						<p className="text-muted-foreground mt-3 text-sm">
							No programs yet.
						</p>
					) : (
						<ul className="divide-border mt-2 divide-y">
							{programs.map((program) => (
								<li
									key={program.id}
									className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2"
								>
									<span className="text-sm font-medium">{program.code}</span>
									<span className="text-muted-foreground truncate text-sm">
										{program.name}
									</span>
									<span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs">
										{departmentCodeFor(program.departmentId)}
									</span>
								</li>
							))}
						</ul>
					)}
				</div>
			</div>

			<AlertDialog
				open={departmentOpen}
				onOpenChange={(details) => setDepartmentOpen(details.open)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Add department</AlertDialogTitle>
						<AlertDialogDescription>
							Departments (colleges) group the programs under them. The code
							must be unique.
						</AlertDialogDescription>
					</AlertDialogHeader>

					<AlertDialogBody>
						<div className="space-y-4">
							<Field>
								<FieldLabel>Code</FieldLabel>
								<FieldDescription>
									Short unique code, e.g. CITE.
								</FieldDescription>
								<Input
									value={departmentCode}
									onChange={(event) => setDepartmentCode(event.target.value)}
									placeholder="CITE"
								/>
							</Field>

							<Field>
								<FieldLabel>Name</FieldLabel>
								<FieldDescription>The department's full name.</FieldDescription>
								<Input
									value={departmentName}
									onChange={(event) => setDepartmentName(event.target.value)}
									placeholder="College of Information Technology Education"
								/>
							</Field>
						</div>
					</AlertDialogBody>

					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction onClick={() => void handleCreateDepartment()}>
							Create
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<AlertDialog
				open={programOpen}
				onOpenChange={(details) => setProgramOpen(details.open)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Add program</AlertDialogTitle>
						<AlertDialogDescription>
							A program belongs to one department. The code must be unique.
						</AlertDialogDescription>
					</AlertDialogHeader>

					<AlertDialogBody>
						<div className="space-y-4">
							<Field>
								<FieldLabel>Department</FieldLabel>
								<SelectDepartment
									departments={departments}
									onValueChange={setProgramDepartmentId}
									value={programDepartmentId}
								/>
							</Field>

							<Field>
								<FieldLabel>Code</FieldLabel>
								<FieldDescription>
									Short unique code, e.g. BSIT.
								</FieldDescription>
								<Input
									value={programCode}
									onChange={(event) => setProgramCode(event.target.value)}
									placeholder="BSIT"
								/>
							</Field>

							<Field>
								<FieldLabel>Name</FieldLabel>
								<FieldDescription>The program's full name.</FieldDescription>
								<Input
									value={programName}
									onChange={(event) => setProgramName(event.target.value)}
									placeholder="Bachelor of Science in Information Technology"
								/>
							</Field>
						</div>
					</AlertDialogBody>

					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction onClick={() => void handleCreateProgram()}>
							Create
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</section>
	);
}

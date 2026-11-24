"use client";

import { useAtomValue } from "jotai";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { ContextRequired } from "@/components/forms/context-required";
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
	selectedProgramIdAtom,
	selectedTermIdAtom,
} from "@/lib/store/atoms/academic";
import { userAtom } from "@/lib/store/atoms/user";
import {
	approveFormAction,
	returnFormAction,
	submitFormAction,
} from "@/server/actions/forms";
import {
	createPlo,
	createPloProposal,
	deletePlo,
	listPloProposals,
	listPlos,
	updatePlo,
	updatePloProposal,
	type PloProposal,
	type PloRecord,
} from "@/server/actions/plan";

const SAMPLE_PLO_RECORDS: PloRecord[] = [
	{
		id: "plo-1",
		programId: "program-1",
		code: "PLO1",
		description: "Apply knowledge of computing",
		targetAttainmentPct: 70,
	},
	{
		id: "plo-2",
		programId: "program-1",
		code: "PLO2",
		description: "Solve complex problems",
		targetAttainmentPct: 70,
	},
	{
		id: "plo-3",
		programId: "program-1",
		code: "PLO3",
		description: "Design systems",
		targetAttainmentPct: 75,
	},
];

/** Next sequential PLO code from a list of code-bearing records. */
function nextPloCode(records: { code: string }[]): string {
	let found = false;
	let bestPrefix = "";
	let bestNum = 0;
	for (const record of records) {
		const match = /^(.*?)(\d+)$/.exec(record.code.trim());
		if (!match) continue;
		const num = Number(match[2]);
		if (!found || num >= bestNum) {
			found = true;
			bestPrefix = match[1];
			bestNum = num;
		}
	}
	return found ? `${bestPrefix}${bestNum + 1}` : "PLO1";
}

const STATUS_LABELS: Record<string, string> = {
	draft: "Draft",
	submitted: "Pending Dean",
	returned: "Returned",
	approved: "Approved",
};

/**
 * PLO management for both the program chair and the dean.
 *
 * - Chair: proposes PLOs (a `plo_management` form submission) and submits them
 *   to the dean. Active PLOs are read-only for the chair.
 * - Dean: authors PLOs directly (immediately active), and approves/returns the
 *   chair's proposals. Approval materializes the active PLO.
 */
export function PloManagementPanel() {
	const programId = useAtomValue(selectedProgramIdAtom);
	const termId = useAtomValue(selectedTermIdAtom);
	const role = useAtomValue(userAtom)?.role;
	const isDean = role === "dean";
	const isChair = role === "program_chair";

	const [plos, setPlos] = useState<PloRecord[]>([]);
	const [proposals, setProposals] = useState<PloProposal[]>([]);
	const [loading, setLoading] = useState(false);

	const [dialogOpen, setDialogOpen] = useState(false);
	const [editingPlo, setEditingPlo] = useState<PloRecord | null>(null);
	const [editingProposal, setEditingProposal] = useState<PloProposal | null>(
		null,
	);
	const [deleteId, setDeleteId] = useState<string | null>(null);
	const [rejecting, setRejecting] = useState<PloProposal | null>(null);
	const [rejectComment, setRejectComment] = useState("");

	const [code, setCode] = useState("");
	const [description, setDescription] = useState("");
	const [target, setTarget] = useState("70");

	const fetchAll = useCallback(async (selectedProgramId: string) => {
		if (!selectedProgramId) {
			setPlos([]);
			setProposals([]);
			return;
		}
		setLoading(true);
		const [ploResult, proposalResult] = await Promise.all([
			listPlos(selectedProgramId),
			listPloProposals(selectedProgramId),
		]);
		if (ploResult.ok) {
			setPlos(ploResult.data);
		} else if (isDevMode) {
			setPlos(SAMPLE_PLO_RECORDS);
		} else {
			toastError({
				title: "Failed to load PLOs",
				description: ploResult.error,
				scope: "plo:list",
			});
		}
		if (proposalResult.ok) {
			setProposals(proposalResult.data);
		} else {
			toastError({
				title: "Failed to load PLO proposals",
				description: proposalResult.error,
				scope: "plo:proposals",
			});
		}
		setLoading(false);
	}, []);

	useEffect(() => {
		void fetchAll(programId);
	}, [programId, fetchAll]);

	const openCreateDialog = () => {
		setEditingPlo(null);
		setEditingProposal(null);
		setCode(nextPloCode([...plos, ...proposals]));
		setDescription("");
		setTarget("70");
		setDialogOpen(true);
	};

	const openEditDialog = (record: PloRecord) => {
		setEditingPlo(record);
		setEditingProposal(null);
		setCode(record.code);
		setDescription(record.description);
		setTarget(record.targetAttainmentPct.toString());
		setDialogOpen(true);
	};

	const openEditProposalDialog = (proposal: PloProposal) => {
		setEditingPlo(null);
		setEditingProposal(proposal);
		setCode(proposal.code);
		setDescription(proposal.description);
		setTarget(proposal.targetAttainmentPct.toString());
		setDialogOpen(true);
	};

	const handleSave = async () => {
		const trimmedCode = code.trim();
		const trimmedDescription = description.trim();
		const targetNum = parseFloat(target);

		if (!trimmedCode) {
			toast.create({ title: "PLO code is required", type: "error" });
			return;
		}
		if (!trimmedDescription) {
			toast.create({ title: "PLO statement is required", type: "error" });
			return;
		}
		if (Number.isNaN(targetNum) || targetNum < 70 || targetNum > 100) {
			toast.create({
				title: "Target must be between 70 and 100",
				type: "error",
			});
			return;
		}

		// Chair editing an existing proposal draft/return.
		if (editingProposal) {
			const result = await updatePloProposal(editingProposal.id, {
				code: trimmedCode,
				description: trimmedDescription,
				targetAttainmentPct: targetNum,
			});
			if (result.ok) {
				toast.create({ title: "Proposal updated", type: "success" });
				setDialogOpen(false);
				void fetchAll(programId);
			} else {
				toastError({
					title: "Update failed",
					description: result.error,
					scope: "plo:proposal-update",
				});
			}
			return;
		}

		// Dean editing an existing active PLO.
		if (editingPlo) {
			const result = await updatePlo(editingPlo.id, {
				code: trimmedCode,
				description: trimmedDescription,
				targetAttainmentPct: targetNum,
			});
			if (result.ok) {
				toast.create({ title: "PLO updated", type: "success" });
				setDialogOpen(false);
				void fetchAll(programId);
			} else if (isDevMode) {
				setPlos((prev) =>
					prev.map((record) =>
						record.id === editingPlo.id
							? {
									...record,
									code: trimmedCode,
									description: trimmedDescription,
									targetAttainmentPct: targetNum,
								}
							: record,
					),
				);
				toast.create({ title: "PLO updated (dev)", type: "success" });
				setDialogOpen(false);
			} else {
				toastError({
					title: "Update failed",
					description: result.error,
					scope: "plo:update",
				});
			}
			return;
		}

		// Create: dean authors an active PLO; the chair proposes for approval.
		if (isDean) {
			const result = await createPlo({
				programId,
				code: trimmedCode,
				description: trimmedDescription,
				targetAttainmentPct: targetNum,
			});
			if (result.ok) {
				toast.create({ title: "PLO created", type: "success" });
				setDialogOpen(false);
				void fetchAll(programId);
			} else {
				toastError({
					title: "Create failed",
					description: result.error,
					scope: "plo:create",
				});
			}
		} else {
			const result = await createPloProposal({
				programId,
				termId,
				code: trimmedCode,
				description: trimmedDescription,
				targetAttainmentPct: targetNum,
			});
			if (result.ok) {
				toast.create({
					title: "PLO proposed — submit it to the dean",
					type: "success",
				});
				setDialogOpen(false);
				void fetchAll(programId);
			} else {
				toastError({
					title: "Propose failed",
					description: result.error,
					scope: "plo:propose",
				});
			}
		}
	};

	const handleDelete = async (id: string) => {
		const result = await deletePlo(id);
		if (result.ok) {
			toast.create({ title: "PLO deleted", type: "success" });
			setDeleteId(null);
			void fetchAll(programId);
		} else if (isDevMode) {
			setPlos((prev) => prev.filter((record) => record.id !== id));
			toast.create({ title: "PLO deleted (dev)", type: "success" });
			setDeleteId(null);
		} else {
			toastError({
				title: "Delete failed",
				description: result.error,
				scope: "plo:delete",
			});
		}
	};

	const handleSubmit = async (proposal: PloProposal) => {
		const result = await submitFormAction(proposal.id);
		if (result.ok) {
			toast.create({ title: "Submitted to the dean", type: "success" });
			void fetchAll(programId);
		} else {
			toastError({
				title: "Submit failed",
				description: result.error,
				scope: "plo:submit",
			});
		}
	};

	const handleApprove = async (proposal: PloProposal) => {
		const result = await approveFormAction(proposal.id, "dean");
		if (result.ok) {
			toast.create({ title: "PLO approved — now active", type: "success" });
			void fetchAll(programId);
		} else {
			toastError({
				title: "Approve failed",
				description: result.error,
				scope: "plo:approve",
			});
		}
	};

	const handleReject = async () => {
		if (!rejecting) return;
		const result = await returnFormAction(
			rejecting.id,
			"dean",
			rejectComment.trim() || "Returned for revision",
		);
		if (result.ok) {
			toast.create({
				title: "Proposal returned to the chair",
				type: "success",
			});
			setRejecting(null);
			setRejectComment("");
			void fetchAll(programId);
		} else {
			toastError({
				title: "Return failed",
				description: result.error,
				scope: "plo:reject",
			});
		}
	};

	const activePlos = plos;

	return (
		<div className="space-y-8">
			{/* Active PLOs */}
			<section className="space-y-4">
				<div className="flex items-center justify-between">
					<h2 className="text-base font-semibold">Active PLOs</h2>
					{isDean && (
						<Button onClick={openCreateDialog} disabled={!programId}>
							+ Add PLO
						</Button>
					)}
				</div>

				{!programId ? (
					<ContextRequired scope="program" />
				) : loading ? (
					<div className="text-muted-foreground py-4 text-center text-sm">
						Loading...
					</div>
				) : activePlos.length === 0 ? (
					<div className="text-muted-foreground rounded-lg border border-dashed p-4 text-center text-sm">
						No active PLOs yet.
					</div>
				) : (
					<div className="overflow-x-auto rounded-lg border">
						<table className="w-full text-sm">
							<thead>
								<tr className="bg-muted/50 text-muted-foreground border-b text-left">
									<th className="px-3 py-2 font-medium">Code</th>
									<th className="px-3 py-2 font-medium">Statement</th>
									<th className="px-3 py-2 text-center font-medium">Target</th>
									{isDean && (
										<th className="px-3 py-2 text-right font-medium">
											Actions
										</th>
									)}
								</tr>
							</thead>
							<tbody>
								{activePlos.map((record) => (
									<tr
										key={record.id}
										className="hover:bg-muted/30 border-b last:border-0"
									>
										<td className="px-3 py-2 font-medium">{record.code}</td>
										<td className="text-muted-foreground px-3 py-2">
											{record.description}
										</td>
										<td className="px-3 py-2 text-center">
											{record.targetAttainmentPct}%
										</td>
										{isDean && (
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
										)}
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</section>

			{/* Proposals */}
			<section className="space-y-4">
				<div className="flex items-center justify-between">
					<h2 className="text-base font-semibold">PLO Proposals</h2>
					{isChair && (
						<Button onClick={openCreateDialog} disabled={!programId || !termId}>
							+ Propose PLO
						</Button>
					)}
				</div>

				{!programId ? (
					<ContextRequired scope="program" />
				) : proposals.length === 0 ? (
					<div className="text-muted-foreground rounded-lg border border-dashed p-4 text-center text-sm">
						{isChair
							? 'No proposals yet. Click "Propose PLO" to draft one, then submit it to the dean.'
							: "No proposals awaiting review."}
					</div>
				) : (
					<div className="overflow-x-auto rounded-lg border">
						<table className="w-full text-sm">
							<thead>
								<tr className="bg-muted/50 text-muted-foreground border-b text-left">
									<th className="px-3 py-2 font-medium">Code</th>
									<th className="px-3 py-2 font-medium">Statement</th>
									<th className="px-3 py-2 text-center font-medium">Status</th>
									<th className="px-3 py-2 font-medium">Prepared by</th>
									<th className="px-3 py-2 text-right font-medium">Actions</th>
								</tr>
							</thead>
							<tbody>
								{proposals.map((proposal) => (
									<tr
										key={proposal.id}
										className="hover:bg-muted/30 border-b last:border-0"
									>
										<td className="px-3 py-2 font-medium">{proposal.code}</td>
										<td className="text-muted-foreground px-3 py-2">
											{proposal.description}
										</td>
										<td className="px-3 py-2 text-center">
											{STATUS_LABELS[proposal.status] ?? proposal.status}
										</td>
										<td className="text-muted-foreground px-3 py-2">
											{proposal.submittedByName ?? "—"}
										</td>
										<td className="px-3 py-2 text-right">
											{isChair &&
												(proposal.status === "draft" ||
													proposal.status === "returned") && (
													<>
														<Button
															variant="ghost"
															className="h-7 px-2"
															onClick={() => openEditProposalDialog(proposal)}
														>
															Edit
														</Button>
														<Button
															variant="ghost"
															className="h-7 px-2"
															onClick={() => handleSubmit(proposal)}
														>
															Submit to Dean
														</Button>
													</>
												)}
											{isDean && proposal.status === "submitted" && (
												<>
													<Button
														variant="ghost"
														className="h-7 px-2"
														onClick={() => handleApprove(proposal)}
													>
														Approve
													</Button>
													<Button
														variant="ghost"
														className="text-destructive h-7 px-2"
														onClick={() => setRejecting(proposal)}
													>
														Reject
													</Button>
												</>
											)}
											<Button variant="ghost" className="h-7 px-2" asChild>
												<Link href={`/submissions/${proposal.id}`}>View</Link>
											</Button>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</section>

			{/* Create/Edit Dialog */}
			<AlertDialog
				open={dialogOpen}
				onOpenChange={(details) => setDialogOpen(details.open)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							{editingPlo || editingProposal
								? "Edit PLO"
								: isDean
									? "Add PLO"
									: "Propose PLO"}
						</AlertDialogTitle>
						<AlertDialogDescription>
							{editingPlo || editingProposal
								? "Update this Program Learning Outcome."
								: isDean
									? "Add a PLO directly — it is active immediately."
									: "Draft a PLO proposal; submit it to the dean afterwards."}
						</AlertDialogDescription>
					</AlertDialogHeader>

					<AlertDialogBody>
						<div className="space-y-4">
							<Field>
								<FieldLabel>Code</FieldLabel>
								<FieldDescription>
									Unique within the program. Suggested as the next in sequence.
								</FieldDescription>
								<Input
									value={code}
									onChange={(e) => setCode(e.target.value)}
									placeholder="PLO1"
								/>
							</Field>

							<Field>
								<FieldLabel>Statement / Description</FieldLabel>
								<FieldDescription>
									The Program Learning Outcome statement.
								</FieldDescription>
								<Textarea
									value={description}
									onChange={(e) => setDescription(e.target.value)}
									placeholder="Apply knowledge of computing..."
								/>
							</Field>

							<Field>
								<FieldLabel>Target Attainment (%)</FieldLabel>
								<FieldDescription>
									Must be at least 70 — the institutional hard floor.
								</FieldDescription>
								<Input
									type="number"
									min={70}
									max={100}
									value={target}
									onChange={(e) => setTarget(e.target.value)}
								/>
							</Field>
						</div>
					</AlertDialogBody>

					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction onClick={handleSave}>
							{editingPlo || editingProposal
								? "Save Changes"
								: isDean
									? "Create"
									: "Propose"}
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
						<AlertDialogTitle>Delete PLO</AlertDialogTitle>
						<AlertDialogDescription>
							Are you sure you want to delete this PLO? PLOs mapped to CLOs or
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

			{/* Reject Dialog */}
			<AlertDialog
				open={rejecting !== null}
				onOpenChange={(details) => {
					if (!details.open) setRejecting(null);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Return PLO proposal</AlertDialogTitle>
						<AlertDialogDescription>
							The proposal is returned to the chair for revision. Add a note so
							the chair knows what to fix.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogBody>
						<Field>
							<FieldLabel>Reviewer note</FieldLabel>
							<Textarea
								value={rejectComment}
								onChange={(e) => setRejectComment(e.target.value)}
								placeholder="Please revise the statement..."
							/>
						</Field>
					</AlertDialogBody>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction variant="destructive" onClick={handleReject}>
							Return
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}

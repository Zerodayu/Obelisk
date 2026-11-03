"use client";

import { useAtomValue } from "jotai";
import { DownloadIcon, FileTextIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { toast, toastError } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/api-client";
import {
	FORM_STATUS_LABELS,
	type FormSubmissionRecord,
	mySubmissionsDataAtom,
} from "@/lib/store/atoms/forms";

/**
 * Dashboard's single PDF export entry point: one menu with one button per
 * exportable submission, one PDF per selection.
 *
 * The list atom is the lighter `scope=mine` read; the full record (with
 * `formMeta` + `approvalSteps`) is refetched on selection so the PDF carries the
 * standard header and signature footer the list omits.
 */
export function ExportPdfMenu() {
	const submissions = useAtomValue(mySubmissionsDataAtom);
	const [busyId, setBusyId] = useState<string | null>(null);

	// Every submission is its own exportable PDF — no dedupe by form type.
	const rows = [...submissions].sort((a, b) =>
		b.updatedAt.localeCompare(a.updatedAt),
	);

	async function exportPdf(row: FormSubmissionRecord) {
		if (busyId) return;
		// NOTE: open the tab before any await — after one, browsers block it as a popup.
		const tab = window.open("", "_blank");
		if (!tab) {
			toastError({
				title: "Pop-up blocked",
				description: "Allow pop-ups for this site to view the PDF.",
				scope: "pdf-popup",
			});
			return;
		}
		setBusyId(row.id);
		try {
			const submission = await api.get<FormSubmissionRecord>(
				`/forms/${row.id}`,
			);
			// NOTE: react-pdf is browser-only and heavy — load it on demand.
			const [{ pdf }, { SubmissionPdf }] = await Promise.all([
				import("@react-pdf/renderer"),
				import("@/components/pdf/submission-pdf"),
			]);
			const blob = await pdf(
				<SubmissionPdf submission={submission} />,
			).toBlob();
			const url = URL.createObjectURL(blob);
			tab.location.href = url;
			// NOTE: the new tab still needs the URL — revoke later, not immediately.
			setTimeout(() => URL.revokeObjectURL(url), 60_000);
			toast.success({
				title: "PDF opened",
				description: submission.formType?.name ?? "Form data",
			});
		} catch (error) {
			tab.close();
			toastError({
				title: "PDF export failed",
				description:
					error instanceof ApiError
						? error.message
						: "Could not build the PDF. Try again.",
				status: error instanceof ApiError ? error.status : undefined,
				scope: "pdf-export",
			});
		} finally {
			setBusyId(null);
		}
	}

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<Button disabled={busyId !== null} size="lg" variant="outline" />
				}
			>
				{busyId ? <Spinner /> : <DownloadIcon />}
				Export PDF
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-72">
				<DropdownMenuGroup>
					<DropdownMenuLabel>Export form data</DropdownMenuLabel>
				</DropdownMenuGroup>
				{rows.length === 0 ? (
					<DropdownMenuItem disabled>No submissions yet</DropdownMenuItem>
				) : (
					rows.map((row) => (
						<DropdownMenuItem
							disabled={busyId !== null}
							key={row.id}
							onClick={() => void exportPdf(row)}
						>
							<FileTextIcon />
							<span className="min-w-0 flex-1">
								<span className="block truncate">
									{row.formType?.name ?? row.formTypeId}
								</span>
								<span className="text-muted-foreground block truncate text-xs">
									{FORM_STATUS_LABELS[row.status]} ·{" "}
									{new Date(row.updatedAt).toLocaleDateString()}
								</span>
							</span>
						</DropdownMenuItem>
					))
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

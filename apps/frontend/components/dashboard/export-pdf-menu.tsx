"use client";

import { useAtomValue } from "jotai";
import { DownloadIcon, FileChartColumnIcon, FileTextIcon } from "lucide-react";
import { useState } from "react";

import {
	CQI_FORM_CODES,
	buildCqiFormPdf,
} from "@/components/submissions/cqi-export-button";
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
import { canAccess } from "@/lib/role-access";
import {
	FORM_STATUS_LABELS,
	type FormSubmissionRecord,
	allSubmissionsDataAtom,
	mySubmissionsDataAtom,
} from "@/lib/store/atoms/forms";
import { userAtom } from "@/lib/store/atoms/user";
import { getCqiInstitutionalReport } from "@/server/actions/reports";

/**
 * Dashboard's single PDF export entry point.
 *
 * Preparers get one item per submission from `scope=mine`. The VPAA never
 * prepares submissions, so its menu lists the institution-wide CQI records
 * (`scope=all`, filtered to the manual-format codes) plus the institutional
 * report. The full record is refetched on selection because the list read omits
 * `formMeta` and `approvalSteps`.
 */
export function ExportPdfMenu() {
	const user = useAtomValue(userAtom);
	const mySubmissions = useAtomValue(mySubmissionsDataAtom);
	const allSubmissions = useAtomValue(allSubmissionsDataAtom);
	const [busyId, setBusyId] = useState<string | null>(null);

	const isVpaa = user?.role === "vpaa";
	const canViewInstitutionalReport = canAccess(
		user?.role,
		"viewCqiInstitutionalReport",
	);

	// Every submission is its own exportable PDF — no dedupe by form type.
	const rows = (isVpaa ? allSubmissions : mySubmissions)
		.filter((row) => !isVpaa || CQI_FORM_CODES.has(row.formType?.code ?? ""))
		.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

	async function openPdf(
		key: string,
		description: string,
		build: () => Promise<Blob>,
	) {
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
		setBusyId(key);
		try {
			const blob = await build();
			const url = URL.createObjectURL(blob);
			tab.location.href = url;
			// NOTE: the new tab still needs the URL — revoke later, not immediately.
			setTimeout(() => URL.revokeObjectURL(url), 60_000);
			toast.success({ title: "PDF opened", description });
		} catch (error) {
			tab.close();
			toastError({
				title: "PDF export failed",
				// NOTE: action failures arrive as plain Errors carrying the server text.
				description:
					error instanceof Error
						? error.message
						: "Could not build the PDF. Try again.",
				status: error instanceof ApiError ? error.status : undefined,
				scope: "pdf-export",
			});
		} finally {
			setBusyId(null);
		}
	}

	function exportSubmission(row: FormSubmissionRecord) {
		return openPdf(row.id, row.formType?.name ?? "Form data", async () => {
			const submission = await api.get<FormSubmissionRecord>(
				`/forms/${row.id}`,
			);
			if (isVpaa) return buildCqiFormPdf(submission);
			// NOTE: react-pdf is browser-only and heavy — load it on demand.
			const [{ pdf }, { SubmissionPdf }] = await Promise.all([
				import("@react-pdf/renderer"),
				import("@/components/pdf/submission-pdf"),
			]);
			return pdf(<SubmissionPdf submission={submission} />).toBlob();
		});
	}

	function exportInstitutionalReport() {
		return openPdf(
			"cqi-institutional-report",
			"CQI Institutional Report",
			async () => {
				const result = await getCqiInstitutionalReport();
				if (!result.ok) throw new Error(result.error);
				const [{ pdf }, { CqiInstitutionalPdf }] = await Promise.all([
					import("@react-pdf/renderer"),
					import("@/components/pdf/cqi-institutional-pdf"),
				]);
				return pdf(<CqiInstitutionalPdf report={result.data} />).toBlob();
			},
		);
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
				{canViewInstitutionalReport ? (
					<DropdownMenuGroup>
						<DropdownMenuLabel>Reports</DropdownMenuLabel>
						<DropdownMenuItem
							disabled={busyId !== null}
							onClick={() => void exportInstitutionalReport()}
						>
							<FileChartColumnIcon />
							<span className="min-w-0 flex-1">
								<span className="block truncate">CQI Institutional Report</span>
								<span className="text-muted-foreground block truncate text-xs">
									Latest term · all programs
								</span>
							</span>
						</DropdownMenuItem>
					</DropdownMenuGroup>
				) : null}
				<DropdownMenuGroup>
					<DropdownMenuLabel>
						{isVpaa ? "CQI form records" : "Export form data"}
					</DropdownMenuLabel>
					{rows.length === 0 ? (
						<DropdownMenuItem disabled>
							{isVpaa ? "No CQI records yet" : "No submissions yet"}
						</DropdownMenuItem>
					) : (
						rows.map((row) => (
							<DropdownMenuItem
								disabled={busyId !== null}
								key={row.id}
								onClick={() => void exportSubmission(row)}
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
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

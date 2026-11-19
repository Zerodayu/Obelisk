"use client";

import { useAtomValue } from "jotai";
import { DownloadIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { toastError } from "@/components/ui/toast";
import { api } from "@/lib/api-client";
import type { FormSubmissionRecord } from "@/lib/store/atoms/forms";
import { userAtom } from "@/lib/store/atoms/user";

import { ENDPOINT_BY_CODE } from "./submission-related-data";

/** The CQI & Loop forms that print with the manual layout. */
export const CQI_FORM_CODES = new Set([
	"plo_gap_analysis",
	"cqi_action_plan",
	"closing_the_loop",
	"annual_program_report",
	"action_taken",
]);

/**
 * Build the manual-format PDF for one CQI submission.
 *
 * NOTE: fetches the form's own by-id endpoint because the CQI tables live in
 * relational rows, not in the submission's `formData`.
 */
export async function buildCqiFormPdf(
	submission: FormSubmissionRecord,
): Promise<Blob> {
	const path = ENDPOINT_BY_CODE[submission.formType?.code ?? ""];
	if (!path) throw new Error("No CQI endpoint for this form.");
	const [payload, { pdf }, { CqiFormPdf }] = await Promise.all([
		api.get<unknown>(`${path}/${submission.id}`),
		import("@react-pdf/renderer"),
		import("@/components/pdf/cqi-form-pdf"),
	]);
	return pdf(<CqiFormPdf payload={payload} submission={submission} />).toBlob();
}

/**
 * VPAA-only export of one CQI submission as a manual-format PDF.
 */
export function CqiExportButton({
	submission,
}: {
	submission: FormSubmissionRecord;
}) {
	const user = useAtomValue(userAtom);
	const [exporting, setExporting] = useState(false);

	const code = submission.formType?.code;
	if (user?.role !== "vpaa" || !code || !CQI_FORM_CODES.has(code)) {
		return null;
	}

	const exportPdf = async () => {
		setExporting(true);
		try {
			const win = window.open("", "_blank");
			if (!win) {
				toastError({
					title: "Pop-up blocked",
					description: "Allow pop-ups for this site to view the PDF.",
					scope: "cqi-form:pdf",
				});
				return;
			}
			const blob = await buildCqiFormPdf(submission);
			win.location.href = URL.createObjectURL(blob);
		} catch {
			toastError({
				title: "PDF export failed",
				description: "Could not build the CQI form PDF.",
				scope: "cqi-form:pdf",
			});
		} finally {
			setExporting(false);
		}
	};

	return (
		<Button
			size="sm"
			variant="outline"
			onClick={() => void exportPdf()}
			disabled={exporting}
		>
			{exporting ? "Building…" : "Export PDF"}
			<DownloadIcon />
		</Button>
	);
}

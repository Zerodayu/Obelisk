import Link from "next/link";
import { notFound } from "next/navigation";

import { SubmissionApprovalScreen } from "@/components/submissions/submission-approval-screen";
import { Button } from "@/components/ui/button";
import type { FormSubmissionRecord } from "@/lib/store/atoms/forms";
import { serverApi } from "@/server/api-client";
import { requireUser } from "@/server/auth";

/** Extract the HTTP status from `serverFetch`'s failure message. */
function statusOf(error: unknown): string | undefined {
	return /Server request failed \((\d{3})\)/.exec(String(error))?.[1];
}

/**
 * `/submissions/[id]` — the dedicated approval screen for any form submission.
 * The server page only applies the session guard and the backend visibility
 * gate: `GET /forms/:id` answers 404 for unknown ids and 403 for submissions
 * the caller may not see (owner / system_admin / approval-chain roles), so an
 * invisible submission is diagnosable rather than silently missing.
 */
export default async function SubmissionDetailPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	await requireUser();
	const { id } = await params;

	let submission: FormSubmissionRecord;
	try {
		submission = await serverApi.get<FormSubmissionRecord>(`/forms/${id}`);
	} catch (error) {
		const status = statusOf(error);
		if (status === "404") notFound();
		if (status === "403") return <ForbiddenState id={id} />;
		throw error;
	}

	return (
		<div className="space-y-6 px-4 lg:px-6">
			<SubmissionApprovalScreen initial={submission} submissionId={id} />
		</div>
	);
}

/** 403 — the submission exists but is outside the caller's visibility. */
function ForbiddenState({ id }: { id: string }) {
	return (
		<div className="px-4 lg:px-6">
			<section className="bg-muted/30 space-y-2 rounded-xl border border-dashed p-6">
				<h2 className="text-xl font-semibold tracking-tight">
					Submission not available
				</h2>
				<p className="text-muted-foreground text-sm">
					This account may not open submission{" "}
					<span className="font-mono text-xs">{id}</span> — you must be its
					owner or hold a role in this form&apos;s approval chain.
				</p>
				<Button asChild size="sm" variant="link">
					<Link href="/submissions">Back to submissions</Link>
				</Button>
			</section>
		</div>
	);
}

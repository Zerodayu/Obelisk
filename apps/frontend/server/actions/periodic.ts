/**
 * Periodic / institutional server actions — F09 resource_monitoring,
 * F26 systemic_gap_report, F27 capa_plan, F28 institutional_review.
 *
 * Same two-step flow as CHECK: the backend `POST /<slug>/init` returns the
 * draft FormSubmission row, so the frontend does init → get.
 */

"use server";

import { ApiError } from "@/lib/api-client";
import {
	PERIODIC_FORM_SLUGS,
	type PeriodicFormCode,
} from "@/lib/periodic-slugs";
import { actionApi, serverApi } from "@/server/api-client";

export type ActionResult<TData = void> =
	| { ok: true; data: TData }
	| { ok: false; error: string };

/** One row of `GET /periodic/<slug>` — mirrors the backend list projection. */
export interface PeriodicSubmissionListItem {
	id: string;
	status: string;
	currentApproverRole: string | null;
	createdAt: string;
	updatedAt: string;
	program: { code: string; name: string } | null;
}

function errorMessage(err: unknown, fallback: string): string {
	return err instanceof ApiError ? err.message : fallback;
}

// NOTE: the code→slug map lives in lib/periodic-slugs.ts — this file is
// "use server", so it may only export async functions.

// ---------------------------------------------------------------------------
// Generic init / get / save / list
// ---------------------------------------------------------------------------

export async function initPeriodicForm(
	formCode: PeriodicFormCode,
	params: { programId: string; termId: string },
): Promise<ActionResult<{ id: string }>> {
	const slug = PERIODIC_FORM_SLUGS[formCode];
	try {
		const data = await actionApi.post<{ id: string }>(
			`/periodic/${slug}/init`,
			params,
		);
		return { ok: true, data };
	} catch (err) {
		return {
			ok: false,
			error: errorMessage(err, "Failed to initialize form. Please try again."),
		};
	}
}

export async function getPeriodicForm<T>(
	formCode: PeriodicFormCode,
	id: string,
): Promise<ActionResult<T>> {
	const slug = PERIODIC_FORM_SLUGS[formCode];
	try {
		const data = await serverApi.get<T>(`/periodic/${slug}/${id}`);
		return { ok: true, data };
	} catch (err) {
		return {
			ok: false,
			error: errorMessage(err, "Failed to load form data. Please try again."),
		};
	}
}

export async function savePeriodicForm<T>(
	formCode: PeriodicFormCode,
	id: string,
	body: Record<string, unknown>,
): Promise<ActionResult<T>> {
	const slug = PERIODIC_FORM_SLUGS[formCode];
	try {
		const data = await actionApi.put<T>(`/periodic/${slug}/${id}`, body);
		return { ok: true, data };
	} catch (err) {
		return {
			ok: false,
			error: errorMessage(err, "Failed to save. Please try again."),
		};
	}
}

export async function listPeriodicForm(
	formCode: PeriodicFormCode,
	params: { programId?: string; termId?: string } = {},
): Promise<ActionResult<PeriodicSubmissionListItem[]>> {
	const slug = PERIODIC_FORM_SLUGS[formCode];
	try {
		const query = new URLSearchParams();
		if (params.programId) query.set("programId", params.programId);
		if (params.termId) query.set("termId", params.termId);
		const suffix = query.size > 0 ? `?${query.toString()}` : "";
		const data = await serverApi.get<PeriodicSubmissionListItem[]>(
			`/periodic/${slug}${suffix}`,
		);
		return { ok: true, data };
	} catch (err) {
		return {
			ok: false,
			error: errorMessage(err, "Failed to list submissions. Please try again."),
		};
	}
}

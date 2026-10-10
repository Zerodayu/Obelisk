/**
 * CHECK-phase server actions — supporting instruments (F08–F19).
 *
 * The CHECK backend returns `{ id }` from init (unlike PLAN which returns
 * `{ draft, payload }`), so the frontend does init → get as a two-step flow.
 */

"use server";

import { ApiError } from "@/lib/api-client";
import { CHECK_FORM_SLUGS, type CheckFormCode } from "@/lib/check-slugs";
import { actionApi, serverApi } from "@/server/api-client";

export type ActionResult<TData = void> =
	| { ok: true; data: TData }
	| { ok: false; error: string };

function errorMessage(err: unknown, fallback: string): string {
	return err instanceof ApiError ? err.message : fallback;
}

// NOTE: the code→slug map lives in lib/check-slugs.ts — this file is
// "use server", so it may only export async functions.

// ---------------------------------------------------------------------------
// Generic init / get / save
// ---------------------------------------------------------------------------

export async function initCheckForm(
	formCode: CheckFormCode,
	params: { programId: string; termId: string },
): Promise<ActionResult<{ id: string }>> {
	const slug = CHECK_FORM_SLUGS[formCode];
	try {
		const data = await actionApi.post<{ id: string }>(
			`/check/${slug}/init`,
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

export async function getCheckForm<T>(
	formCode: CheckFormCode,
	id: string,
): Promise<ActionResult<T>> {
	const slug = CHECK_FORM_SLUGS[formCode];
	try {
		const data = await serverApi.get<T>(`/check/${slug}/${id}`);
		return { ok: true, data };
	} catch (err) {
		return {
			ok: false,
			error: errorMessage(err, "Failed to load form data. Please try again."),
		};
	}
}

export async function saveCheckForm<T>(
	formCode: CheckFormCode,
	id: string,
	body: Record<string, unknown>,
): Promise<ActionResult<T>> {
	const slug = CHECK_FORM_SLUGS[formCode];
	try {
		const data = await actionApi.put<T>(`/check/${slug}/${id}`, body);
		return { ok: true, data };
	} catch (err) {
		return {
			ok: false,
			error: errorMessage(err, "Failed to save. Please try again."),
		};
	}
}

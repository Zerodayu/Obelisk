import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import { APPROVAL_ROUTES } from "@lib/forms/approval-routes";
import { APPROVAL_CHAIN } from "@lib/forms/state-machine";
import { FEATURE_ACCESS as BACKEND_FEATURE_ACCESS } from "@lib/role-access";
import {
	FEATURE_ACCESS as FRONTEND_FEATURE_ACCESS,
	FORM_ACCESS as FRONTEND_FORM_ACCESS,
} from "../../../frontend/lib/role-access";

/**
 * Drift guard: `frontend/lib/role-access.ts` is the client-side mirror of the
 * backend's feature gates (`lib/role-access.ts`) and per-form registry
 * (`lib/forms/approval-routes.ts`). Editing one side without the other fails
 * this test, so a role's access can never silently diverge between
 * enforcement (backend) and visibility (frontend).
 */
const FRONTEND_MIRROR_PATH = join(
	import.meta.dir,
	"../../../frontend/lib/role-access.ts",
);

describe("frontend role-access mirror", () => {
	it("declares the same feature allow-lists as the backend", () => {
		expect(FRONTEND_FEATURE_ACCESS).toEqual(BACKEND_FEATURE_ACCESS);
	});

	it("mirrors every form code's preparers and chain", () => {
		expect(Object.keys(FRONTEND_FORM_ACCESS).sort()).toEqual(
			Object.keys(APPROVAL_ROUTES).sort(),
		);
		for (const [code, route] of Object.entries(APPROVAL_ROUTES)) {
			const mirror = FRONTEND_FORM_ACCESS[code];
			expect(mirror, `missing FORM_ACCESS entry for ${code}`).toBeDefined();
			expect([...mirror.preparers]).toEqual([...route.preparerRoles]);
			expect([...mirror.chain]).toEqual([...route.chain]);
		}
	});

	it("keeps approveForms equal to the canonical chain + admin override", () => {
		const expected: readonly string[] = [...APPROVAL_CHAIN, "system_admin"];
		expect(BACKEND_FEATURE_ACCESS.approveForms as readonly string[]).toEqual(
			expected,
		);
		expect(FRONTEND_FEATURE_ACCESS.approveForms as readonly string[]).toEqual(
			expected,
		);
	});

	it("keeps the mirror import-free so any runtime can load it", async () => {
		const source = await Bun.file(FRONTEND_MIRROR_PATH).text();
		expect(source).not.toMatch(/^\s*import\s/m);
	});
});

import { describe, expect, it } from "bun:test";

import { APPROVAL_ROUTES } from "@lib/forms/approval-routes";
import {
	FORM_TAGS as BACKEND_FORM_TAGS,
	formTag,
	needsApproval,
} from "@lib/forms/form-tags";

import {
	FORM_TAGS as FRONTEND_FORM_TAGS,
	formNeedsApproval,
} from "../../../frontend/lib/form-tags";

/**
 * Drift guard: `frontend/lib/form-tags.ts` mirrors the backend registry that
 * drives both the submit path (file vs. descend the chain) and the "My
 * Submissions" inbox filter — editing one side without the other fails here.
 */
describe("form-tags registry", () => {
	it("mirrors the backend tag map on the frontend", () => {
		expect(FRONTEND_FORM_TAGS).toEqual(BACKEND_FORM_TAGS);
	});

	it("tags every registered stable form code", () => {
		for (const code of Object.keys(APPROVAL_ROUTES)) {
			expect(BACKEND_FORM_TAGS[code], `missing tag for ${code}`).toBeDefined();
		}
	});

	it("makes only Setup and Record approval-free", () => {
		// Setup + Record file straight to approved; Submit + Live keep the chain.
		for (const [code, tag] of Object.entries(BACKEND_FORM_TAGS)) {
			const approvalFree = tag === "setup" || tag === "record";
			expect(needsApproval(code), code).toBe(!approvalFree);
			expect(formNeedsApproval(code), code).toBe(!approvalFree);
		}
		// Unknown codes fall back to a full approval chain.
		expect(formTag("unknown-code")).toBe("submit");
		expect(needsApproval("unknown-code")).toBe(true);
	});
});

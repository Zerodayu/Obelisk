import { describe, expect, it } from "bun:test";
import {
	APPROVAL_CHAIN,
	assertEditable,
	assertTransition,
	canTransition,
	EDITABLE_STATUSES,
	firstPendingRole,
	InvalidTransitionError,
	STATUS_TRANSITIONS,
	validateApprovalChain,
} from "@lib/forms/state-machine";

describe("submission state machine", () => {
	it("has the canonical approval chain and status transitions", () => {
		expect(APPROVAL_CHAIN).toEqual(["program_chair", "dean", "aqau", "vpaa"]);
		expect(STATUS_TRANSITIONS.draft).toEqual(["submitted", "archived"]);
		expect(STATUS_TRANSITIONS.submitted).toEqual(["returned", "approved"]);
		expect(STATUS_TRANSITIONS.returned).toEqual(["submitted"]);
		expect(STATUS_TRANSITIONS.approved).toEqual(["archived"]);
		expect(STATUS_TRANSITIONS.archived).toEqual([]);
	});

	it("allows only legal transitions", () => {
		expect(canTransition("draft", "submitted")).toBe(true);
		expect(canTransition("draft", "approved")).toBe(false);
		expect(canTransition("submitted", "approved")).toBe(true);
		expect(canTransition("approved", "returned")).toBe(false);
		expect(canTransition("archived", "draft")).toBe(false);
	});

	it("assertTransition throws on illegal moves", () => {
		expect(() => assertTransition("draft", "submitted")).not.toThrow();
		expect(() => assertTransition("draft", "approved")).toThrow(
			InvalidTransitionError,
		);
	});

	it("treats draft and returned as editable", () => {
		expect(EDITABLE_STATUSES).toEqual(["draft", "returned"]);
		expect(() => assertEditable("draft")).not.toThrow();
		expect(() => assertEditable("returned")).not.toThrow();
		expect(() => assertEditable("submitted")).toThrow(InvalidTransitionError);
		expect(() => assertEditable("approved")).toThrow(InvalidTransitionError);
	});

	it("accepts a strictly ascending approval chain", () => {
		expect(() =>
			validateApprovalChain([
				{ approverRole: "program_chair", sequenceNo: 1 },
				{ approverRole: "dean", sequenceNo: 2 },
				{ approverRole: "vpaa", sequenceNo: 3 },
			]),
		).not.toThrow();
	});

	it("allows skipping intermediate roles but rejects reordering", () => {
		expect(() =>
			validateApprovalChain([
				{ approverRole: "program_chair", sequenceNo: 1 },
				{ approverRole: "vpaa", sequenceNo: 2 },
			]),
		).not.toThrow();

		expect(() =>
			validateApprovalChain([
				{ approverRole: "dean", sequenceNo: 1 },
				{ approverRole: "program_chair", sequenceNo: 2 },
			]),
		).toThrow(InvalidTransitionError);
	});

	it("resolves the first pending role by lowest sequence number", () => {
		expect(
			firstPendingRole([
				{ approverRole: "dean", sequenceNo: 2 },
				{ approverRole: "program_chair", sequenceNo: 1 },
			]),
		).toBe("program_chair");
	});
});

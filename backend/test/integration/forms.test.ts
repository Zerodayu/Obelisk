import { describe, expect, it } from "bun:test";
import { prisma } from "@lib/prisma";
import { submissionService } from "../../src/v1/forms/service";
import { isDbReachable } from "../helpers/db-gate";

const db = await isDbReachable();

describe.skipIf(!db)("forms service (integration)", () => {
	it("runs the full submission lifecycle end to end", async () => {
		const formType = await prisma.formType.create({
			data: {
				id: "it-form-type",
				code: "it_forms",
				name: "Integration Test Form",
				pdcaStage: "DO",
				sequenceNo: 999,
			},
		});
		const term = await prisma.academicTerm.create({
			data: {
				id: "it-term",
				schoolYear: "2099-2100",
				semester: "1st",
				isActive: false,
			},
		});
		const user = await prisma.user.create({
			data: {
				id: "it-user",
				name: "Integration Tester",
				email: "it-tester@obelisk.local",
				role: "faculty",
				isActive: true,
			},
		});

		try {
			const created = await submissionService.create(
				{
					formTypeId: formType.id,
					termId: term.id,
					formData: { note: "seed" },
				},
				user.id,
			);
			expect(created.status).toBe("draft");

			const submitted = await submissionService.submit(created.id, user.id, [
				{ approverRole: "program_chair", sequenceNo: 1 },
				{ approverRole: "dean", sequenceNo: 2 },
			]);
			expect(submitted.status).toBe("submitted");
			expect(submitted.currentApproverRole).toBe("program_chair");

			const advanced = await submissionService.decide(
				submitted.id,
				"program_chair",
				user.id,
				{ decision: "approved" },
			);
			expect(advanced.status).toBe("submitted");
			expect(advanced.currentApproverRole).toBe("dean");

			const approved = await submissionService.decide(
				advanced.id,
				"dean",
				user.id,
				{ decision: "approved" },
			);
			expect(approved.status).toBe("approved");

			await submissionService.archive(approved.id, user.id);
		} finally {
			await prisma.formSubmission.deleteMany({
				where: { formTypeId: formType.id },
			});
			await prisma.formType.delete({ where: { id: formType.id } });
			await prisma.academicTerm.delete({ where: { id: term.id } });
			await prisma.user.delete({ where: { id: user.id } });
		}
	});
});

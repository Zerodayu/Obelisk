import { FORM_TAGS } from "@lib/forms/form-tags";
import { prisma } from "@lib/prisma";

/* NOTE: one-shot migration for approval-free forms (Setup/Record tags) —
 * moves leftover `submitted` rows straight to `approved` and drops their
 * approval steps so nothing sits in an approver's Pending queue. */

const approvalFreeCodes = Object.entries(FORM_TAGS)
	.filter(([, tag]) => tag === "setup" || tag === "record")
	.map(([code]) => code);

const formTypes = await prisma.formType.findMany({
	where: { code: { in: approvalFreeCodes } },
	select: { id: true, code: true },
});
const formTypeIds = formTypes.map((t) => t.id);

const steps = await prisma.approvalStep.deleteMany({
	where: { formSubmission: { formTypeId: { in: formTypeIds } } },
});

const filed = await prisma.formSubmission.updateMany({
	where: { formTypeId: { in: formTypeIds }, status: "submitted" },
	data: { status: "approved", currentApproverRole: null },
});

console.log(
	`backfill-approval-free: filed ${filed.count} submission(s) as approved, ` +
		`removed ${steps.count} approval step(s) across ${formTypes.length} form type(s)`,
);

await prisma.$disconnect();

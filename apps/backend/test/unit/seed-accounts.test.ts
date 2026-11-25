import { describe, expect, it } from "bun:test";

import { planAccounts } from "@prisma/seed-accounts";

const programs = [
	{ id: "p1", code: "BSIT", departmentId: "d1" },
	{ id: "p2", code: "BSRT", departmentId: "d2" },
];
const departments = [
	{ id: "d1", code: "CITE" },
	{ id: "d2", code: "CAHSE" },
];

describe("dummy account planner", () => {
	it("plans five faculty and five chairs per program plus one dean per department", () => {
		const plans = planAccounts(programs, departments, []);

		expect(plans).toHaveLength(22);
		for (const program of programs) {
			expect(
				plans.filter(
					(plan) => plan.role === "faculty" && plan.programId === program.id,
				),
			).toHaveLength(5);
			expect(
				plans.filter(
					(plan) =>
						plan.role === "program_chair" && plan.programId === program.id,
				),
			).toHaveLength(5);
		}
		expect(plans.filter((plan) => plan.role === "dean")).toHaveLength(2);
		expect(plans.map((plan) => plan.email)).toContain(
			"bsit-faculty1@jmc.edu.test",
		);
		expect(plans.map((plan) => plan.email)).toContain(
			"bsrt-progchair5@jmc.edu.test",
		);
		expect(plans.every((plan) => plan.password === "password123")).toBe(true);
		expect(new Set(plans.map((plan) => plan.email)).size).toBe(plans.length);
	});

	it("counts existing scoped accounts, skips exact emails and departments with a dean", () => {
		const existing = [
			{
				email: "bsrt-faculty1@jmc.edu.test",
				role: "faculty",
				programId: "p2",
				departmentId: "d2",
			},
			// Irregular legacy name still counts toward the five.
			{
				email: "cte-faculty1@jmc.edu.test",
				role: "faculty",
				programId: "p1",
				departmentId: "d1",
			},
			{
				email: "cite-dean@jmc.edu.test",
				role: "dean",
				programId: null,
				departmentId: "d1",
			},
		];

		const plans = planAccounts(programs, departments, existing);
		const emails = plans.map((plan) => plan.email);

		expect(
			plans.filter(
				(plan) => plan.role === "faculty" && plan.programId === "p1",
			),
		).toHaveLength(4);
		expect(
			plans.filter(
				(plan) => plan.role === "faculty" && plan.programId === "p2",
			),
		).toHaveLength(4);
		expect(
			plans.filter((plan) => plan.role === "dean").map((plan) => plan.email),
		).toEqual(["cahse-dean@jmc.edu.test"]);
		expect(emails).not.toContain("bsrt-faculty1@jmc.edu.test");
		expect(new Set(emails).size).toBe(emails.length);
		expect(plans.every((plan) => plan.email.endsWith("@jmc.edu.test"))).toBe(
			true,
		);
	});
});

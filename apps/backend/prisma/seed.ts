import { prisma } from "@lib/prisma";
import { env } from "@utils/env";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";

const seedAuth = betterAuth({
	basePath: "/api/v1/auth",

	trustedOrigins: [env.FRONTEND_URL, "http://localhost:3000"],

	database: prismaAdapter(prisma, {
		provider: "postgresql",
	}),

	user: {
		additionalFields: {
			role: {
				type: "string",
				input: false,
				required: false,
				defaultValue: "user",
			},
			requestedRole: {
				type: "string",
				input: true,
				required: false,
			},
			roleRequestStatus: {
				type: "string",
				input: false,
				required: false,
				defaultValue: "none",
			},
			employeeId: { type: "string", input: false, required: false },
			programId: { type: "string", input: false, required: false },
			departmentId: { type: "string", input: false, required: false },
			isActive: {
				type: "boolean",
				input: false,
				required: false,
				defaultValue: true,
			},
		},
	},

	databaseHooks: {
		user: {
			create: {
				before: async (user) => ({
					data: {
						...user,
						role: "user",
						roleRequestStatus: user.requestedRole ? "pending" : "none",
					},
				}),
			},
		},
	},

	emailAndPassword: {
		enabled: true,
		disableSignUp: false,
		password: {
			hash: (pass) => Bun.password.hash(pass),
			verify: ({ password, hash }) => Bun.password.verify(password, hash),
		},
	},

	advanced: {
		cookiePrefix: "obelisk-app",
		database: {
			generateId: false,
		},
	},

	session: {
		expiresIn: 60 * 60 * 24 * 7,
		cookieCache: {
			enabled: true,
			maxAge: 60 * 5,
		},
	},
});

// This is the hardcoded ID from the frontend component.
const TARGET_CLASS_SECTION_ID = "clv92a9f1000108l3d26b52b3";
const DEPT_CODE = "CITE";
const BSIT_PROG_CODE = "BSIT";

const ACTUAL_CLO_CODES = [
	"CLO1",
	"CLO2",
	"CLO3",
	"CLO4",
	"CLO5",
	"CLO6",
	"CLO7",
];

const COURSES = [
	// FIRST YEAR
	// First Semester
	{ code: "IT 101", title: "Introduction to Computing" },
	{ code: "IT 102", title: "Computer Programming 1" },
	// Second Semester
	{ code: "IT 103", title: "Computer Programming 2" },
	{ code: "IT 104", title: "Introduction to Human Computer Interaction" },
	{ code: "IT 105", title: "Discrete Mathematics 1" },

	// SECOND YEAR
	// First Semester
	{ code: "IT 201", title: "Data Structures and Algorithms" },
	{ code: "IT 202", title: "Networking 1" },
	{ code: "IT Elect 1", title: "Object Oriented Programming" },
	{ code: "IT Elect 2", title: "Platform Technologies" },
	// Second Semester
	{ code: "IT 203", title: "Information Management" },
	{
		code: "IT 204",
		title: "Quantitative Methods (Incl. Modeling & Simulation)",
	},
	{ code: "IT 205", title: "Integrative Programming & Technologies" },
	{ code: "IT 206", title: "Networking 2" },
	{ code: "IT 207", title: "Multimedia" },
	{ code: "IT Elect 3", title: "Web Systems and Technologies 1" },

	// THIRD YEAR
	// First Semester
	{ code: "IT 301", title: "Advance Database Systems" },
	{ code: "IT 302", title: "System Integration and Architecture" },
	{ code: "IT 303", title: "Event-Driven Programming" },
	{ code: "IT 304", title: "Information Assurance and Security 1" },
	{ code: "IT 305", title: "Mobile Application Development" },
	{ code: "IT 306", title: "Game Development" },
	{ code: "IT 307", title: "Web Systems and Technologies 2" },
	// Second Semester
	{ code: "IT 308", title: "Information Assurance and Security 2" },
	{
		code: "IT 309",
		title: "Application Development and Emerging Technologies",
	},
	{ code: "IT 310", title: "Data Science and Analytics" },
	{ code: "IT 311", title: "Technopreneurship" },
	{ code: "IT 312", title: "Embedded Systems" },
	{ code: "IT Elect 4", title: "System Integration and Architecture 2" },
	// Summer
	{ code: "CAP 101", title: "Capstone Project and Research 1" },
	{ code: "SP 101", title: "Social and Professional Issues" },

	// FOURTH YEAR
	// First Semester
	{ code: "CAP 102", title: "Capstone Project and Research 2" },
	{ code: "IT 401", title: "Systems Administration and Maintenance" },
	{ code: "SWT 101", title: "ICT Seminar & Workshop" },
	// Second Semester
	{ code: "PRAC 101", title: "PRACTICUM (486 HOURS)" },
];

const BSIT_PLOS = [
	{
		code: "PLO1",
		description:
			"Apply knowledge of computing, science and mathematics appropriate to the discipline.",
	},
	{
		code: "PLO2",
		description:
			"Understand best IT practices and standards and their applications.",
	},
	{
		code: "PLO3",
		description:
			"Analyze complex problems, and identify and define the computing requirements appropriate to its solution.",
	},
	{
		code: "PLO4",
		description:
			"Identify and analyze user needs and take them into account in the selection, creation, evaluation and administration of computer-based systems.",
	},
	{
		code: "PLO5",
		description:
			"Design, implement and evaluate computer-based systems, processes, components or programs to meet desired needs and requirements under various constraints.",
	},
	{
		code: "PLO6",
		description:
			"Integrate IT-based solutions into the user environment effectively.",
	},
	{
		code: "PLO7",
		description:
			"Apply knowledge through the use of current techniques, skills, tools and practices necessary for the IT profession.",
	},
	{
		code: "PLO8",
		description:
			"Function effectively as a member or a leader of a development team recognizing the different roles within a team to accomplish a common goal.",
	},
	{
		code: "PLO9",
		description: "Assist in the creation of an effective IT project plan.",
	},
	{
		code: "PLO10",
		description:
			"Communicate effectively with the computing community and with society at large about complex computing activities through logical writing, presentations and clear instructions.",
	},
	{
		code: "PLO11",
		description:
			"Analyze the local and global impact of computing information technology on individuals, organizations and society.",
	},
	{
		code: "PLO12",
		description:
			"Understand professional, ethical, legal, security and social issues and responsibilities in the utilization of Information Technology.",
	},
	{
		code: "PLO13",
		description:
			"Recognize the need for and engage in planning self-learning and improving performance as a foundation for continuing professional development.",
	},
];

async function main() {
	/* WARN: destructive seed — refuse production targets (testing_results 1.3):
	 * NODE_ENV=production (db:seed-prod sets it) or the in-network `db` host;
	 * OBELISK_SEED_ALLOW_PROD=1 overrides to bootstrap a fresh instance */
	const seedUrl = process.env.DATABASE_URL ?? process.env.DIRECT_URL ?? "";
	if (
		process.env.OBELISK_SEED_ALLOW_PROD !== "1" &&
		(process.env.NODE_ENV === "production" ||
			/^postgresql:\/\/[^@/]+@db(:\d+)?\//.test(seedUrl))
	) {
		console.error(
			"FATAL: refusing to seed a production database — set OBELISK_SEED_ALLOW_PROD=1 only to bootstrap a fresh production instance.",
		);
		process.exit(1);
	}

	console.log("Starting seed process...");

	// --- Comprehensive Cleanup ---
	console.log("Cleaning up previous seed data...");

	await prisma.atRiskFlag.deleteMany({});
	await prisma.cloAttainment.deleteMany({});
	await prisma.computationRun.deleteMany({});
	await prisma.student.deleteMany({});
	await prisma.user.deleteMany({
		where: { email: { endsWith: "@jmcfi.edu.ph" } },
	});
	await prisma.department.deleteMany({
		where: { code: { in: ["TEST-DEPT", DEPT_CODE] } },
	});
	await prisma.program.deleteMany({
		where: { code: { in: ["TEST-PROG", BSIT_PROG_CODE] } },
	});
	await prisma.classSection.deleteMany({
		where: { id: TARGET_CLASS_SECTION_ID },
	});
	await prisma.academicTerm.deleteMany({
		where: { semester: { in: ["Test Semester", "1st Semester"] } },
	});

	console.log("Cleanup complete. Seeding new data...");

	// --- Seeding New Data ---

	// Create the dev user through Better Auth so password hashing and account
	// rows are handled by the library itself.
	const devEmail = "dev@jmcfi.edu.ph";
	const devPassword = "password123";
	const devName = "Development User";

	await seedAuth.api.signUpEmail({
		body: {
			email: devEmail,
			password: devPassword,
			name: devName,
		},
	});

	const devUser = await prisma.user.findUnique({
		where: { email: devEmail },
	});

	if (!devUser) {
		throw new Error(`Failed to create development user ${devEmail}`);
	}

	await prisma.user.update({
		where: { id: devUser.id },
		data: {
			role: "system_admin",
		},
	});

	console.log(`Created development user: ${devEmail} (ID: ${devUser.id})`);
	console.log(`Working dev credentials: ${devEmail} / ${devPassword}`);

	// One demo account per role — `<id>@jmcfi.edu.ph` / devPassword — so the
	// approval chain (lib/forms/approval-routes.ts) and every role gate can be
	// exercised end-to-end. `id` is the email local part and what
	// `just dev-as <id>` accepts; the data-bearing roles get a **second**
	// account (`<role>1`) so the same role can be signed in twice and you can
	// check which data is shared across users of one role (submissions +
	// ingest history are per-user, class-section data and pending-approval
	// inboxes are shared). `user` (onboarding only) and `system_admin` keep a
	// single account. The frontend mirrors this list in
	// `frontend/lib/dev-accounts.ts` (`just dev-as <id>` signs the browser in
	// through `/dev/session`); keep both sides in sync.
	const ROLE_ACCOUNTS = [
		// NOTE: "user" is the onboarding role — these accounts land on /onboarding.
		{ id: "user", role: "user", name: "User Role Demo" },
		{ id: "faculty", role: "faculty", name: "Faculty User" },
		{ id: "faculty1", role: "faculty", name: "Faculty User 2" },
		{ id: "program_chair", role: "program_chair", name: "Program Chair User" },
		{
			id: "program_chair1",
			role: "program_chair",
			name: "Program Chair User 2",
		},
		{ id: "dean", role: "dean", name: "Dean User" },
		{ id: "dean1", role: "dean", name: "Dean User 2" },
		{ id: "aqau", role: "aqau", name: "AQAU User" },
		{ id: "aqau1", role: "aqau", name: "AQAU User 2" },
		{ id: "vpaa", role: "vpaa", name: "VPAA User" },
		{ id: "vpaa1", role: "vpaa", name: "VPAA User 2" },
		{ id: "system_admin", role: "system_admin", name: "System Admin User" },
	] as const;

	for (const account of ROLE_ACCOUNTS) {
		const email = `${account.id}@jmcfi.edu.ph`;
		await seedAuth.api.signUpEmail({
			body: { email, password: devPassword, name: account.name },
		});
		const created = await prisma.user.findUnique({ where: { email } });
		if (!created) {
			throw new Error(`Failed to create role user ${email}`);
		}
		await prisma.user.update({
			where: { id: created.id },
			data: { role: account.role },
		});
		console.log(`Created role user: ${email} (${account.role})`);
	}
	console.log(`Role demo credentials: <id>@jmcfi.edu.ph / ${devPassword}`);

	const department = await prisma.department.upsert({
		where: { code: DEPT_CODE },
		update: { name: "CITE" },
		create: {
			id: crypto.randomUUID(),
			name: "CITE",
			code: DEPT_CODE,
		},
	});
	console.log(
		`Created/updated department: ${department.name} (${department.code})`,
	);

	const program = await prisma.program.upsert({
		where: { code: BSIT_PROG_CODE },
		update: {
			name: "BSIT",
			departmentId: department.id,
		},
		create: {
			id: crypto.randomUUID(),
			name: "BSIT",
			code: BSIT_PROG_CODE,
			departmentId: department.id,
		},
	});
	console.log(`Created/updated program: ${program.name} (${program.code})`);

	// Scope the demo accounts exactly the way an onboarding request would
	// (`REQUESTED_SCOPE` in src/v1/auth/model.ts): a dean files the department,
	// faculty / program_chair file the program and inherit its department —
	// so the sidebar header reads "— CITE: <role>" for them in dev.
	const SCOPED_DEMO_ROLES = [
		{ role: "dean", programId: null, departmentId: department.id },
		{
			role: "program_chair",
			programId: program.id,
			departmentId: department.id,
		},
		{ role: "faculty", programId: program.id, departmentId: department.id },
	] as const;
	for (const scope of SCOPED_DEMO_ROLES) {
		const scoped = await prisma.user.updateMany({
			where: { email: { endsWith: "@jmcfi.edu.ph" }, role: scope.role },
			data: {
				programId: scope.programId,
				departmentId: scope.departmentId,
			},
		});
		console.log(
			`Scoped ${scoped.count} ${scope.role} account(s) to ${
				scope.programId ? `${program.code} / ` : ""
			}${department.code}`,
		);
	}

	// Seed 13 BSIT Program Learning Outcomes (PLOs)
	for (const plo of BSIT_PLOS) {
		const existingPlo = await prisma.plo.findFirst({
			where: {
				programId: program.id,
				code: plo.code,
			},
		});

		if (existingPlo) {
			await prisma.plo.update({
				where: { id: existingPlo.id },
				data: {
					description: plo.description,
				},
			});
		} else {
			await prisma.plo.create({
				data: {
					id: crypto.randomUUID(),
					programId: program.id,
					code: plo.code,
					description: plo.description,
				},
			});
		}
	}
	console.log(`Seeded ${BSIT_PLOS.length} PLOs for program ${program.name}`);

	const currentYear = new Date().getFullYear();
	const schoolYear = `${currentYear}-${currentYear + 1}`;
	const semester = "1st Semester";

	const academicTerm = await prisma.academicTerm.upsert({
		where: {
			schoolYear_semester: {
				schoolYear,
				semester,
			},
		},
		update: {
			isActive: true,
		},
		create: {
			id: crypto.randomUUID(),
			schoolYear,
			semester,
			isActive: true,
		},
	});
	console.log(
		`Created/updated academic term: ${academicTerm.schoolYear} ${academicTerm.semester}`,
	);

	let firstCourse: { id: string; title: string; code: string } | null = null;

	for (const courseData of COURSES) {
		const course = await prisma.course.upsert({
			where: {
				programId_code: {
					programId: program.id,
					code: courseData.code,
				},
			},
			update: {
				title: courseData.title,
			},
			create: {
				id: crypto.randomUUID(),
				title: courseData.title,
				code: courseData.code,
				programId: program.id,
			},
		});
		if (!firstCourse) {
			firstCourse = course;
		}
		console.log(`Created course: ${course.title} (${course.code})`);
	}

	const classSection = await prisma.classSection.upsert({
		where: { id: TARGET_CLASS_SECTION_ID },
		update: {
			sectionCode: "1A",
			courseId: firstCourse!.id,
			termId: academicTerm.id,
		},
		create: {
			id: TARGET_CLASS_SECTION_ID,
			sectionCode: "1A",
			courseId: firstCourse!.id,
			termId: academicTerm.id,
		},
	});
	console.log(
		`Created/updated class section: ${classSection.sectionCode} (ID: ${classSection.id})`,
	);

	for (const cloCode of ACTUAL_CLO_CODES) {
		const existingClo = await prisma.clo.findFirst({
			where: {
				courseId: firstCourse!.id,
				code: cloCode,
			},
		});

		// NOTE: CLO6/CLO7 exist only to reach the seeded count of 7 — the workbook yields CLO1–CLO5, so label them as dev fixtures (testing_results 6.10)
		const description = ["CLO6", "CLO7"].includes(cloCode)
			? `Placeholder CLO (${cloCode}) — not yet defined (dev fixture)`
			: `CLO for ${firstCourse!.title}`;

		if (existingClo) {
			await prisma.clo.update({
				where: { id: existingClo.id },
				data: {
					description,
				},
			});
		} else {
			await prisma.clo.create({
				data: {
					id: crypto.randomUUID(),
					code: cloCode,
					description,
					courseId: firstCourse!.id,
				},
			});
		}
		console.log(`Configured CLO: ${cloCode}`);
	}

	// Fetch and display seeded PLOs
	const seededPlos = await prisma.plo.findMany({
		where: { programId: program.id },
		orderBy: { code: "asc" },
	});
	console.log(`\n--- Resulting BSIT PLOs (${seededPlos.length} rows) ---`);
	for (const plo of seededPlos) {
		console.log(
			`[${plo.code}] (ID: ${plo.id}) target: ${plo.targetAttainmentPct}%\n  ${plo.description}`,
		);
	}

	console.log("\nSeed process finished successfully.");
}

main()
	.catch((e) => {
		console.error(e);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});

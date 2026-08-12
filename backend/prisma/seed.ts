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
const TEST_DEPT_CODE = "TEST-DEPT";
const TEST_PROG_CODE = "TEST-PROG";

// CLO codes from the actual "Electro-Mechanical Systems" workbook.
const ACTUAL_CLO_CODES = [
	"CLO1",
	"CLO2",
	"CLO3",
	"CLO4",
	"CLO5",
	"CLO6",
	"CLO7",
];

async function main() {
	console.log("Starting seed process...");

	// --- Comprehensive Cleanup ---
	console.log("Cleaning up previous seed data...");

	await prisma.atRiskFlag.deleteMany({});
	await prisma.cloAttainment.deleteMany({});
	await prisma.computationRun.deleteMany({});
	await prisma.student.deleteMany({});
	await prisma.user.deleteMany({ where: { email: "dev@jmcfi.edu.ph" } });
	await prisma.department.deleteMany({ where: { code: TEST_DEPT_CODE } });
	await prisma.classSection.deleteMany({
		where: { id: TARGET_CLASS_SECTION_ID },
	});
	await prisma.academicTerm.deleteMany({
		where: { semester: "Test Semester" },
	});

	console.log("Cleanup complete. Seeding new data...");

	// --- Seeding New Data ---

	// 1. Create the development user through Better Auth so password hashing
	//    and account rows are handled by the library itself.
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

	// Create other academic data
	const department = await prisma.department.create({
		data: {
			id: crypto.randomUUID(),
			name: "Test Department",
			code: TEST_DEPT_CODE,
		},
	});
	console.log(`Created department: ${department.name}`);

	const program = await prisma.program.create({
		data: {
			id: crypto.randomUUID(),
			name: "Test Program",
			code: TEST_PROG_CODE,
			departmentId: department.id,
		},
	});
	console.log(`Created program: ${program.name}`);

	const academicTerm = await prisma.academicTerm.create({
		data: {
			id: crypto.randomUUID(),
			schoolYear: `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`,
			semester: "Test Semester",
			isActive: true,
		},
	});
	console.log(
		`Created academic term: ${academicTerm.schoolYear} ${academicTerm.semester}`,
	);

	const course = await prisma.course.create({
		data: {
			id: crypto.randomUUID(),
			title: "Electro-Mechanical Systems",
			code: "ELECMECH201",
			programId: program.id,
		},
	});
	console.log(`Created course: ${course.title}`);

	const classSection = await prisma.classSection.create({
		data: {
			id: TARGET_CLASS_SECTION_ID,
			sectionCode: "A",
			courseId: course.id,
			termId: academicTerm.id,
		},
	});
	console.log(
		`Created class section: ${classSection.sectionCode} (ID: ${classSection.id})`,
	);

	for (const cloCode of ACTUAL_CLO_CODES) {
		const clo = await prisma.clo.create({
			data: {
				id: crypto.randomUUID(),
				code: cloCode,
				description: `CLO for ${course.title}`,
				courseId: course.id,
			},
		});
		console.log(`Created CLO: ${clo.code}`);
	}

	console.log("Seed process finished.");
}

main()
	.catch((e) => {
		console.error(e);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});

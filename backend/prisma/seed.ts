import { randomUUID } from "node:crypto";
import { prisma } from "@lib/prisma";

// This is the hardcoded ID from the frontend component.
const TARGET_CLASS_SECTION_ID = "clv92a9f1000108l3d26b52b3";
const TEST_DEPT_CODE = "TEST-DEPT";
const TEST_PROG_CODE = "TEST-PROG";
const DEV_USER_ID = "clv000000000000000000000000"; // A known, predictable ID

// These are the actual CLO codes from the test workbook.
const ACTUAL_CLO_CODES = ["CLO1", "CLO2", "CLO3", "CLO4", "CLO5"];

async function main() {
	console.log("Starting seed process...");

	// --- Comprehensive Cleanup ---
	console.log("Cleaning up previous seed data...");

	// Delete records from the bottom of the dependency chain upwards.
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

	// 0. Create a predictable, all-powerful development user
	const devUser = await prisma.user.create({
		data: {
			id: DEV_USER_ID,
			email: "dev@jmcfi.edu.ph",
			name: "Development User",
			role: "system_admin",
			isActive: true,
			roleRequestStatus: "approved",
		},
	});
	console.log(`Created development user: ${devUser.email} (ID: ${devUser.id})`);

	// 1. Create a Department
	const department = await prisma.department.create({
		data: {
			id: randomUUID(),
			name: "Test Department",
			code: TEST_DEPT_CODE,
		},
	});
	console.log(`Created department: ${department.name}`);

	// 2. Create a Program linked to the Department
	const program = await prisma.program.create({
		data: {
			id: randomUUID(),
			name: "Test Program",
			code: TEST_PROG_CODE,
			departmentId: department.id,
		},
	});
	console.log(`Created program: ${program.name}`);

	// 3. Create an active Academic Term
	const currentYear = new Date().getFullYear();
	const academicTerm = await prisma.academicTerm.create({
		data: {
			id: randomUUID(),
			schoolYear: `${currentYear}-${currentYear + 1}`,
			semester: "Test Semester",
			isActive: true,
		},
	});
	console.log(
		`Created academic term: ${academicTerm.schoolYear} ${academicTerm.semester}`,
	);

	// 4. Create a Course linked to the Program
	const course = await prisma.course.create({
		data: {
			id: randomUUID(),
			title: "Test Course",
			code: "TEST-101",
			programId: program.id,
		},
	});
	console.log(`Created course: ${course.title}`);

	// 5. Create the specific ClassSection linked to the Course and Term
	const classSection = await prisma.classSection.create({
		data: {
			id: TARGET_CLASS_SECTION_ID, // Use the hardcoded ID
			sectionCode: "T1",
			courseId: course.id,
			termId: academicTerm.id,
		},
	});
	console.log(
		`Created class section: ${classSection.sectionCode} (ID: ${classSection.id})`,
	);

	// 6. Create the actual CLOs linked to the Course
	for (const cloCode of ACTUAL_CLO_CODES) {
		const clo = await prisma.clo.create({
			data: {
				id: randomUUID(),
				code: cloCode,
				description: `Placeholder description for ${cloCode}`,
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

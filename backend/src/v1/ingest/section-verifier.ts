import type {
	EtlLoadedData,
	EtlSectionExtractionStatus,
	EtlSectionInfo,
	EtlSetupInfo,
} from "@lib/ingest/ingest-client";

export interface AcademicContextForComparison {
	sectionCode: string;
	course: {
		code: string;
		program: {
			code: string;
		};
	};
	term: {
		schoolYear: string;
		semester: string;
	};
}

export type SectionVerificationStatus = "match" | "mismatch" | "unverified";

export interface SectionComparisonResult {
	status: SectionVerificationStatus;
	mismatches: string[];
	warnings: string[];
}

/**
 * Normalizes a code/text string by trimming, uppercasing, and removing all internal whitespace.
 */
function normalizeCompact(val: string | null | undefined): string {
	if (!val) return "";
	return val.replace(/\s+/g, "").toUpperCase();
}

/**
 * Normalizes semester names to a standard numerical or label representation:
 * 1 (1st sem / 1st / first), 2 (2nd sem / 2nd / second), or "summer".
 */
export function normalizeSemester(
	raw: string | null | undefined,
): string | null {
	if (!raw) return null;
	const s = raw.trim().toLowerCase();
	if (/(^1\b|1st|first)/i.test(s)) return "1";
	if (/(^2\b|2nd|second)/i.test(s)) return "2";
	if (/(^3\b|3rd|third)/i.test(s)) return "3";
	if (/summer|midyear/i.test(s)) return "summer";
	return s;
}

/**
 * Normalizes a school year string (e.g. "2026-2027" or "AY 2026-2027" or "2026 – 2027")
 * to "YYYY-YYYY".
 */
export function extractSchoolYear(
	raw: string | null | undefined,
): string | null {
	if (!raw) return null;
	const match = raw.match(/(\d{4})\s*[-–]\s*(\d{4})/);
	if (!match) return null;
	return `${match[1]}-${match[2]}`;
}

/**
 * Pure function comparing the selected ClassSection against the workbook loaded data.
 * No DB or I/O inside.
 *
 * Rules:
 * - Section: normalize both sides (trim, uppercase, strip whitespace) and compare section.code to classSection.sectionCode.
 * - Program: compare section.program to course.program.code (NOT setup.program).
 * - Course code: compare setup.course_code to course.code, normalized. Warning only.
 * - Term: extract schoolYear with (\d{4})\s*[-–]\s*(\d{4}) and normalize semester text to number/label. Warning only.
 *
 * Status determination:
 * - If section_extraction === "ok":
 *   - Any section or program mismatch yields status "mismatch".
 *   - Otherwise yields status "match".
 * - If section_extraction !== "ok" (missing_sheet, missing_field, unparseable, undefined):
 *   - Yields status "unverified".
 */
export function compareSectionToWorkbook(
	classSection: AcademicContextForComparison,
	loaded: {
		section?: EtlSectionInfo | null;
		section_extraction?: EtlSectionExtractionStatus | null;
		setup?: EtlSetupInfo | null;
	},
): SectionComparisonResult {
	const mismatches: string[] = [];
	const warnings: string[] = [];

	const extractionStatus = loaded.section_extraction;
	const isOk = extractionStatus === "ok";

	if (!isOk) {
		warnings.push(
			`Workbook section verification unverified (extraction status: "${extractionStatus ?? "missing"}").`,
		);
	}

	// 1. Section Code comparison
	const workbookSection = normalizeCompact(loaded.section?.code);
	const selectedSection = normalizeCompact(classSection.sectionCode);

	if (isOk) {
		if (!workbookSection) {
			mismatches.push(
				`Workbook section code is empty, but selected section is "${classSection.sectionCode}".`,
			);
		} else if (workbookSection !== selectedSection) {
			mismatches.push(
				`Workbook section "${loaded.section?.code ?? ""}" does not match selected section "${classSection.sectionCode}".`,
			);
		}
	} else if (workbookSection && workbookSection !== selectedSection) {
		warnings.push(
			`Possible section difference: workbook indicates "${loaded.section?.code}", selected is "${classSection.sectionCode}".`,
		);
	}

	// 2. Program comparison (section.program vs course.program.code)
	const workbookProgram = normalizeCompact(loaded.section?.program);
	const selectedProgram = normalizeCompact(classSection.course.program.code);

	if (isOk) {
		if (workbookProgram && workbookProgram !== selectedProgram) {
			mismatches.push(
				`Workbook program "${loaded.section?.program}" does not match selected program "${classSection.course.program.code}".`,
			);
		}
	} else if (workbookProgram && workbookProgram !== selectedProgram) {
		warnings.push(
			`Possible program difference: workbook indicates "${loaded.section?.program}", selected is "${classSection.course.program.code}".`,
		);
	}

	// 3. Course code comparison (Warning only)
	if (loaded.setup?.course_code) {
		const workbookCourse = normalizeCompact(loaded.setup.course_code);
		const selectedCourse = normalizeCompact(classSection.course.code);
		if (workbookCourse && workbookCourse !== selectedCourse) {
			warnings.push(
				`Workbook course code "${loaded.setup.course_code}" does not match selected section course "${classSection.course.code}".`,
			);
		}
	}

	// 4. Term comparison (Warning only)
	if (loaded.setup?.term) {
		const rawTerm = loaded.setup.term;
		const wbYear = extractSchoolYear(rawTerm);
		const selYear = extractSchoolYear(classSection.term.schoolYear);

		if (wbYear && selYear && wbYear !== selYear) {
			warnings.push(
				`Workbook term academic year "${wbYear}" does not match selected term "${classSection.term.schoolYear}".`,
			);
		}

		const wbSem = normalizeSemester(rawTerm);
		const selSem = normalizeSemester(classSection.term.semester);
		if (wbSem && selSem && wbSem !== selSem) {
			warnings.push(
				`Workbook term semester does not match selected term semester ("${classSection.term.semester}").`,
			);
		}
	}

	let status: SectionVerificationStatus;
	if (!isOk) {
		status = "unverified";
	} else if (mismatches.length > 0) {
		status = "mismatch";
	} else {
		status = "match";
	}

	return {
		status,
		mismatches,
		warnings,
	};
}

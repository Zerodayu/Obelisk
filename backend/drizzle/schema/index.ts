// Better Auth core tables
export { account } from "./account";
export { session } from "./session";
export { user } from "./user";
export { verification } from "./verification";

// Enums
export {
	userRoleEnum,
	assessmentTypeEnum,
	submissionStatusEnum,
	approvalDecisionEnum,
	approverRoleEnum,
	recommendationStatusEnum,
	exportFormatEnum,
} from "./enums";

// Academic structure
export { academicTerm } from "./academic-term";
export { program } from "./program";
export { department } from "./department";
export { course } from "./course";
export { classSection } from "./class-section";

// Students and learning outcomes
export { student } from "./student";
export { clo } from "./clo";
export { plo } from "./plo";
export { peo } from "./peo";
export { cloToPloMap } from "./clo-plo-map";
export { ploToPeoMap } from "./plo-peo-map";

// Assessments & scores
export { assessmentItem } from "./assessment-item";
export { studentScore } from "./student-score";

// Forms and approval workflow
export { formType } from "./form-type";
export { formSubmission } from "./form-submission";
export { approvalStep } from "./approval-step";

// Computation & attainment
export { computationRun } from "./computation-run";
export { cloAttainment } from "./clo-attainment";
export { ploAttainment } from "./plo-attainment";

// Monitoring & AI
export { auditLog } from "./audit-log";
export { atRiskFlag } from "./at-risk-flag";
export { aiRecommendation } from "./ai-recommendation";

// Reports
export { reportExport } from "./report-export";

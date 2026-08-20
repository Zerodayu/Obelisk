import { env } from "@utils/env";

export type JobStatus = "queued" | "running" | "completed" | "failed";

export interface StructuredError {
	error_type: string;
	message?: string;
	details?: Record<string, unknown>;
}

// This is the actual shape of the data loaded by the python-server
export interface EtlLoadedData {
	header: unknown;
	attainments: unknown[];
	clo_plo_mapping: unknown;
}

// This is the shape of the 'result' field in a completed job
export interface EtlResultData {
	loaded: EtlLoadedData;
}

export interface ETLJob {
	job_id: string;
	type?: string;
	status: JobStatus;
	payload?: Record<string, unknown>;
	created_at?: string;
	updated_at?: string;
	error?: StructuredError | null;
	result?: EtlResultData | null;
}

export interface IngestResult {
	job_id: string;
	status: "completed";
	result?: EtlResultData | null;
}

// --- Analytics summary (/analytics/summary) --------------------------
// Contract mirrors python-server app/schemas/institutional_summary.py +
// app/analytics/institutional_summary.py (pure rollups, synchronous, no auth).

export type SummaryPeriodType = "semester" | "year" | "custom";

export type SummaryPeriod = {
	type: SummaryPeriodType;
	label: string;
};

export interface AnalyticsCourseSubmission {
	department?: string | null;
	program?: string | null;
	avp_group?: string | null;
	course_code?: string | null;
	section?: string | null;
	header: Record<string, unknown>;
	attainments: Record<string, unknown>[];
	clo_plo_mapping: Record<string, unknown>[];
}

export interface AnalyticsSubmissionsPayload {
	period: SummaryPeriod;
	submissions: AnalyticsCourseSubmission[];
}

export interface AnalyticsMappedCloSummary {
	clo_code: string;
	mean_attainment_pct: number;
	rule1_met: boolean;
}

export interface AnalyticsPloSummary {
	plo_attainment_direct_only: number;
	plo_completeness_pct: number;
	plo_rule3_met: boolean;
	mapped_clos: AnalyticsMappedCloSummary[];
}

export interface AnalyticsCloSummary {
	mean_attainment_pct: number;
	record_count: number;
	rule1_met: boolean;
}

export interface AnalyticsLevelSummary {
	total_attainment_records: number;
	clos: Record<string, AnalyticsCloSummary>;
	plos: Record<string, AnalyticsPloSummary>;
}

export interface AnalyticsProgramSummary extends AnalyticsLevelSummary {
	program_plo_average: number;
}

export interface AnalyticsWorstPerformer {
	group_name: string;
	key: string;
	clo_code: string;
	mean_attainment_pct: number;
	record_count: number;
}

export interface AnalyticsSummaryResponse {
	period: SummaryPeriod;
	department_summary: Record<string, AnalyticsLevelSummary>;
	program_summary: Record<string, AnalyticsProgramSummary>;
	avp_group_summary: Record<string, AnalyticsLevelSummary>;
	worst_performing_clos: AnalyticsWorstPerformer[];
}

export class PythonServerError extends Error {
	public readonly error_type: string;
	public readonly details?: Record<string, unknown>;

	constructor(error: StructuredError) {
		super(error.message ?? error.error_type);
		this.name = "PythonServerError";
		this.error_type = error.error_type;
		this.details = error.details;
	}
}

export class IngestJobFailedError extends Error {
	public readonly error_type: string;
	public readonly details?: Record<string, unknown>;

	constructor(error: StructuredError) {
		super(error.message ?? error.error_type);
		this.name = "IngestJobFailedError";
		this.error_type = error.error_type;
		this.details = error.details;
	}
}

const DEFAULT_POLL_INTERVAL_MS = 1000;
const DEFAULT_MAX_POLLS = 60;

class IngestClient {
	private readonly baseUrl: string;

	constructor(baseUrl: string) {
		this.baseUrl = baseUrl.replace(/\/+$/, "");
	}

	async upload(file: Blob, filename: string): Promise<string> {
		const form = new FormData();
		form.append("file", file, filename);

		const response = await fetch(`${this.baseUrl}/upload`, {
			method: "POST",
			body: form,
		});

		if (!response.ok) {
			// Try to parse a structured error from the python server
			try {
				const errorBody = (await response.json()) as {
					detail: StructuredError;
				};
				if (errorBody.detail) {
					throw new PythonServerError(errorBody.detail);
				}
			} catch (e) {
				// If parsing fails or it's not the expected shape, throw generic error
				if (e instanceof PythonServerError) throw e;
				throw new Error(`Upload failed with status ${response.status}`);
			}
			// Fallback for non-JSON error responses
			throw new Error(`Upload failed with status ${response.status}`);
		}

		const body = (await response.json()) as { job_id: string };
		return body.job_id;
	}

	async getJob(jobId: string): Promise<ETLJob> {
		const response = await fetch(`${this.baseUrl}/jobs/${jobId}`, {
			method: "GET",
		});

		if (response.status === 404) {
			throw new Error(`Job ${jobId} not found`);
		}

		if (!response.ok) {
			throw new Error(`Failed to get job ${jobId}, status: ${response.status}`);
		}

		const body = (await response.json()) as ETLJob;
		return body;
	}

	async waitForCompletion(
		jobId: string,
		opts: { intervalMs?: number; maxPolls?: number } = {},
	): Promise<IngestResult> {
		const intervalMs = opts.intervalMs ?? DEFAULT_POLL_INTERVAL_MS;
		const maxPolls = opts.maxPolls ?? DEFAULT_MAX_POLLS;

		for (let attempt = 0; attempt < maxPolls; attempt += 1) {
			const job = await this.getJob(jobId);

			if (job.status === "completed") {
				return { job_id: job.job_id, status: "completed", result: job.result };
			}

			if (job.status === "failed") {
				const error = job.error ?? { error_type: "UnknownError" };
				throw new IngestJobFailedError(error);
			}

			await Bun.sleep(intervalMs);
		}

		throw new Error(`Timed out polling job ${jobId} after ${maxPolls} polls`);
	}

	async ingest(file: Blob, filename: string): Promise<IngestResult> {
		const jobId = await this.upload(file, filename);
		return this.waitForCompletion(jobId);
	}

	/**
	 * Requests Python-Formula 2A/7A/7C rollups from the python-server's
	 * synchronous `/analytics/summary` endpoint. The payload's per-student CLO
	 * records are the raw ETL `StudentCLOAttainment` rows (0–1 fraction scale);
	 * the webapp assembles them from its persisted `etlSnapshotJson`.
	 */
	async analyticsSummary(
		payload: AnalyticsSubmissionsPayload,
	): Promise<AnalyticsSummaryResponse> {
		const response = await fetch(`${this.baseUrl}/analytics/summary`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
		});

		if (!response.ok) {
			try {
				const errorBody = (await response.json()) as {
					detail: StructuredError;
				};
				if (errorBody.detail) {
					throw new PythonServerError(errorBody.detail);
				}
			} catch (error) {
				if (error instanceof PythonServerError) throw error;
				throw new Error(
					`Analytics summary failed with status ${response.status}`,
				);
			}
			throw new Error(
				`Analytics summary failed with status ${response.status}`,
			);
		}

		return (await response.json()) as AnalyticsSummaryResponse;
	}
}

export const ingestClient = new IngestClient(env.PYTHON_SERVER_URL);

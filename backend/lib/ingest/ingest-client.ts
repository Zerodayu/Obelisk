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
            const errorBody = (await response.json()) as { detail: StructuredError };
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
			throw new Error(
				`Failed to get job ${jobId}, status: ${response.status}`,
			);
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
}

export const ingestClient = new IngestClient(env.PYTHON_SERVER_URL);
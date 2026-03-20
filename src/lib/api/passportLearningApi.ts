export interface PassportLearningStatus {
  outbox: {
    pending: number;
    processing: number;
    failed: number;
    done: number;
  };
  trainJobs: {
    queued: number;
    running: number;
    failed: number;
    succeeded: number;
  };
  latestDataset: null | {
    datasetVersionId: string;
    datasetType: string;
    versionLabel: string;
    sampleCount: number;
    status: string;
    createdAt: number;
  };
  latestEval: null | {
    evalId: string;
    modelVersion: string;
    evalScope: string;
    gateResult: string;
    createdAt: number;
  };
  latestTrainJob: null | {
    trainJobId: string;
    targetModelVersion: string;
    status: string;
    createdAt: number;
  };
}

export interface PassportDatasetVersion {
  datasetVersionId: string;
  datasetType: string;
  versionLabel: string;
  sampleCount: number;
  status: string;
  windowStart: number;
  windowEnd: number;
  qualityReport: Record<string, unknown>;
  createdAt: number;
}

export interface PassportEvalReport {
  evalId: string;
  trainJobId: string | null;
  modelVersion: string;
  evalScope: string;
  gateResult: string;
  metrics: Record<string, unknown>;
  notes: string | null;
  createdAt: number;
}

export interface PassportTrainJob {
  trainJobId: string;
  trainType: string;
  modelRole: string;
  targetModelVersion: string;
  triggerReason: string;
  status: string;
  datasetVersionIds: string[];
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
}

export interface PassportReport {
  reportId: string;
  reportType: string;
  modelName: string;
  modelVersion: string;
  periodStart: number;
  periodEnd: number;
  summary: string;
  status: string;
  createdAt: number;
}

export interface PassportOutboxWorkerResult {
  workerId: string;
  claimed: number;
  processed: number;
  failed: number;
}

type JsonHeaders = Record<string, string>;

function canUseBrowserFetch(): boolean {
  return typeof window !== 'undefined' && typeof fetch === 'function';
}

function toQueryString(params: Record<string, string | number | null | undefined>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') return;
    search.set(key, String(value));
  });
  const query = search.toString();
  return query ? `?${query}` : '';
}

async function requestJson<T>(url: string, init: RequestInit): Promise<T> {
  const headers: JsonHeaders = {
    'content-type': 'application/json',
    ...(init.headers as JsonHeaders | undefined),
  };

  const res = await fetch(url, { ...init, headers });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const payload = (await res.json()) as { error?: string };
      if (payload?.error) message = payload.error;
    } catch {
      // ignore parse error
    }
    throw new Error(message);
  }

  return (await res.json()) as T;
}

export async function fetchPassportLearningStatus(): Promise<PassportLearningStatus | null> {
  if (!canUseBrowserFetch()) return null;
  try {
    const result = await requestJson<{ success: boolean; status: PassportLearningStatus }>(
      '/api/profile/passport/learning/status',
      { method: 'GET' },
    );
    return result.status ?? null;
  } catch {
    return null;
  }
}

export async function fetchPassportLearningDatasets(input?: {
  datasetType?: string;
  limit?: number;
}): Promise<PassportDatasetVersion[]> {
  if (!canUseBrowserFetch()) return [];
  try {
    const query = toQueryString({
      datasetType: input?.datasetType ?? null,
      limit: input?.limit ?? 10,
    });
    const result = await requestJson<{ success: boolean; records: PassportDatasetVersion[] }>(
      `/api/profile/passport/learning/datasets${query}`,
      { method: 'GET' },
    );
    return Array.isArray(result.records) ? result.records : [];
  } catch {
    return [];
  }
}

export async function fetchPassportLearningEvals(input?: {
  evalScope?: string;
  limit?: number;
}): Promise<PassportEvalReport[]> {
  if (!canUseBrowserFetch()) return [];
  try {
    const query = toQueryString({
      evalScope: input?.evalScope ?? null,
      limit: input?.limit ?? 10,
    });
    const result = await requestJson<{ success: boolean; records: PassportEvalReport[] }>(
      `/api/profile/passport/learning/evals${query}`,
      { method: 'GET' },
    );
    return Array.isArray(result.records) ? result.records : [];
  } catch {
    return [];
  }
}

export async function fetchPassportLearningTrainJobs(limit = 10): Promise<PassportTrainJob[]> {
  if (!canUseBrowserFetch()) return [];
  try {
    const query = toQueryString({ limit });
    const result = await requestJson<{ success: boolean; jobs: PassportTrainJob[] }>(
      `/api/profile/passport/learning/train-jobs${query}`,
      { method: 'GET' },
    );
    return Array.isArray(result.jobs) ? result.jobs : [];
  } catch {
    return [];
  }
}

export async function fetchPassportLearningReports(input?: {
  status?: string;
  limit?: number;
}): Promise<PassportReport[]> {
  if (!canUseBrowserFetch()) return [];
  try {
    const query = toQueryString({
      status: input?.status ?? null,
      limit: input?.limit ?? 5,
    });
    const result = await requestJson<{ success: boolean; reports: PassportReport[] }>(
      `/api/profile/passport/learning/reports${query}`,
      { method: 'GET' },
    );
    return Array.isArray(result.reports) ? result.reports : [];
  } catch {
    return [];
  }
}

export async function runPassportLearningWorker(input?: {
  workerId?: string;
  limit?: number;
}): Promise<PassportOutboxWorkerResult | null> {
  if (!canUseBrowserFetch()) return null;
  try {
    const result = await requestJson<{ success: boolean; worker: PassportOutboxWorkerResult }>(
      '/api/profile/passport/learning/workers/run',
      {
        method: 'POST',
        body: JSON.stringify({
          workerId: input?.workerId,
          limit: input?.limit,
        }),
      },
    );
    return result.worker ?? null;
  } catch {
    return null;
  }
}

export async function queuePassportRetrainJob(input?: {
  modelRole?: 'policy' | 'analyst';
  targetModelVersion?: string;
  datasetVersionIds?: string[];
  triggerReason?: string;
}): Promise<PassportTrainJob | null> {
  if (!canUseBrowserFetch()) return null;
  try {
    const result = await requestJson<{ success: boolean; job: PassportTrainJob }>(
      '/api/profile/passport/learning/train-jobs',
      {
        method: 'POST',
        body: JSON.stringify({
          trainType: 'retrain',
          modelRole: input?.modelRole ?? 'policy',
          targetModelVersion: input?.targetModelVersion,
          datasetVersionIds: input?.datasetVersionIds ?? [],
          triggerReason: input?.triggerReason ?? 'manual_passport',
          hyperparams: {
            scheduler: 'cosine',
            lr: 0.00002,
          },
        }),
      },
    );
    return result.job ?? null;
  } catch {
    return null;
  }
}

export async function generatePassportLearningReport(input?: {
  reportType?: 'daily' | 'weekly' | 'monthly' | 'on_demand';
  modelVersion?: string;
  summary?: string;
}): Promise<PassportReport | null> {
  if (!canUseBrowserFetch()) return null;
  try {
    const now = Date.now();
    const periodEnd = new Date(now).toISOString();
    const periodStart = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
    const result = await requestJson<{ success: boolean; report: PassportReport }>(
      '/api/profile/passport/learning/reports/generate',
      {
        method: 'POST',
        body: JSON.stringify({
          reportType: input?.reportType ?? 'on_demand',
          periodStart,
          periodEnd,
          modelName: 'passport-analyst',
          modelVersion: input?.modelVersion ?? `passport-ui-${Date.now()}`,
          summary: input?.summary ?? '# Passport Report\n\nGenerated from Passport UI action.',
        }),
      },
    );
    return result.report ?? null;
  } catch {
    return null;
  }
}

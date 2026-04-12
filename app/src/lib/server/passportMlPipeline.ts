import { randomUUID } from 'node:crypto';
import { toBoundedInt, UUID_RE } from '$lib/server/apiValidation';
import { query, withTransaction } from '$lib/server/db';

const TRAIN_TYPES = new Set(['pretrain', 'sft', 'orpo', 'retrain']);
const MODEL_ROLES = new Set(['policy', 'analyst']);
const DATASET_TYPES = new Set(['pretrain', 'sft', 'orpo']);
const REPORT_TYPES = new Set(['daily', 'weekly', 'monthly', 'on_demand']);

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toSafeObject(value: unknown, fallback: Record<string, unknown> = {}): Record<string, unknown> {
  return isObject(value) ? value : fallback;
}

function normalizeLimit(value: unknown, fallback = 20, max = 200): number {
  return toBoundedInt(value, fallback, 1, max);
}

function normalizeDatasetType(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return DATASET_TYPES.has(normalized) ? normalized : null;
}

function normalizeTrainType(value: unknown): 'pretrain' | 'sft' | 'orpo' | 'retrain' {
  if (typeof value !== 'string') return 'retrain';
  const normalized = value.trim().toLowerCase();
  return TRAIN_TYPES.has(normalized) ? (normalized as 'pretrain' | 'sft' | 'orpo' | 'retrain') : 'retrain';
}

function normalizeModelRole(value: unknown): 'policy' | 'analyst' {
  if (typeof value !== 'string') return 'policy';
  const normalized = value.trim().toLowerCase();
  return MODEL_ROLES.has(normalized) ? (normalized as 'policy' | 'analyst') : 'policy';
}

function normalizeReportType(value: unknown): 'daily' | 'weekly' | 'monthly' | 'on_demand' {
  if (typeof value !== 'string') return 'on_demand';
  const normalized = value.trim().toLowerCase();
  return REPORT_TYPES.has(normalized) ? (normalized as 'daily' | 'weekly' | 'monthly' | 'on_demand') : 'on_demand';
}

function normalizeIsoDate(value: unknown, fallback: Date): Date {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return parsed;
}

function pickDatasetVersionIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.trim())
    .filter((v) => UUID_RE.test(v));
}

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

export async function getPassportLearningStatus(userId: string): Promise<PassportLearningStatus> {
  const [outboxResult, trainResult, datasetResult, evalResult, latestTrainResult] = await Promise.all([
    query<{ status: string; count: string }>(
      `SELECT status, count(*)::text AS count FROM passport_event_outbox WHERE user_id = $1 GROUP BY status`,
      [userId],
    ),
    query<{ status: string; count: string }>(
      `SELECT status, count(*)::text AS count FROM ml_train_jobs WHERE user_id = $1 GROUP BY status`,
      [userId],
    ),
    query<{
      dataset_version_id: string;
      dataset_type: string;
      version_label: string;
      sample_count: number;
      status: string;
      created_at: string;
    }>(
      `
        SELECT dataset_version_id, dataset_type, version_label, sample_count, status, created_at
        FROM ml_dataset_versions
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [userId],
    ),
    query<{
      eval_id: string;
      model_version: string;
      eval_scope: string;
      gate_result: string;
      created_at: string;
    }>(
      `
        SELECT eval_id, model_version, eval_scope, gate_result, created_at
        FROM ml_eval_reports
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [userId],
    ),
    query<{
      train_job_id: string;
      target_model_version: string;
      status: string;
      created_at: string;
    }>(
      `
        SELECT train_job_id, target_model_version, status, created_at
        FROM ml_train_jobs
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [userId],
    ),
  ]);

  const outboxMap: Record<string, number> = { pending: 0, processing: 0, failed: 0, done: 0 };
  for (const row of outboxResult.rows) outboxMap[row.status] = Number(row.count ?? '0');

  const trainMap: Record<string, number> = { queued: 0, running: 0, failed: 0, succeeded: 0 };
  for (const row of trainResult.rows) trainMap[row.status] = Number(row.count ?? '0');

  const latestDatasetRow = datasetResult.rows[0];
  const latestEvalRow = evalResult.rows[0];
  const latestTrainRow = latestTrainResult.rows[0];

  return {
    outbox: {
      pending: outboxMap.pending ?? 0,
      processing: outboxMap.processing ?? 0,
      failed: outboxMap.failed ?? 0,
      done: outboxMap.done ?? 0,
    },
    trainJobs: {
      queued: trainMap.queued ?? 0,
      running: trainMap.running ?? 0,
      failed: trainMap.failed ?? 0,
      succeeded: trainMap.succeeded ?? 0,
    },
    latestDataset: latestDatasetRow
      ? {
          datasetVersionId: latestDatasetRow.dataset_version_id,
          datasetType: latestDatasetRow.dataset_type,
          versionLabel: latestDatasetRow.version_label,
          sampleCount: Number(latestDatasetRow.sample_count ?? 0),
          status: latestDatasetRow.status,
          createdAt: new Date(latestDatasetRow.created_at).getTime(),
        }
      : null,
    latestEval: latestEvalRow
      ? {
          evalId: latestEvalRow.eval_id,
          modelVersion: latestEvalRow.model_version,
          evalScope: latestEvalRow.eval_scope,
          gateResult: latestEvalRow.gate_result,
          createdAt: new Date(latestEvalRow.created_at).getTime(),
        }
      : null,
    latestTrainJob: latestTrainRow
      ? {
          trainJobId: latestTrainRow.train_job_id,
          targetModelVersion: latestTrainRow.target_model_version,
          status: latestTrainRow.status,
          createdAt: new Date(latestTrainRow.created_at).getTime(),
        }
      : null,
  };
}

export async function listPassportDatasetVersions(
  userId: string,
  input: { datasetType?: unknown; limit?: unknown },
): Promise<
  Array<{
    datasetVersionId: string;
    datasetType: string;
    versionLabel: string;
    sampleCount: number;
    status: string;
    windowStart: number;
    windowEnd: number;
    qualityReport: Record<string, unknown>;
    createdAt: number;
  }>
> {
  const datasetType = normalizeDatasetType(input.datasetType);
  const limit = normalizeLimit(input.limit, 20, 100);

  const where = ['user_id = $1'];
  const params: unknown[] = [userId];
  if (datasetType) {
    params.push(datasetType);
    where.push(`dataset_type = $${params.length}`);
  }

  params.push(limit);

  const result = await query<{
    dataset_version_id: string;
    dataset_type: string;
    version_label: string;
    sample_count: number;
    status: string;
    window_start: string;
    window_end: string;
    quality_report: unknown;
    created_at: string;
  }>(
    `
      SELECT
        dataset_version_id,
        dataset_type,
        version_label,
        sample_count,
        status,
        window_start,
        window_end,
        quality_report,
        created_at
      FROM ml_dataset_versions
      WHERE ${where.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT $${params.length}
    `,
    params,
  );

  return result.rows.map((row: (typeof result.rows)[number]) => ({
    datasetVersionId: row.dataset_version_id,
    datasetType: row.dataset_type,
    versionLabel: row.version_label,
    sampleCount: Number(row.sample_count ?? 0),
    status: row.status,
    windowStart: new Date(row.window_start).getTime(),
    windowEnd: new Date(row.window_end).getTime(),
    qualityReport: toSafeObject(row.quality_report),
    createdAt: new Date(row.created_at).getTime(),
  }));
}

export async function listPassportEvalReports(
  userId: string,
  input: { evalScope?: unknown; limit?: unknown },
): Promise<
  Array<{
    evalId: string;
    trainJobId: string | null;
    modelVersion: string;
    evalScope: string;
    gateResult: string;
    metrics: Record<string, unknown>;
    notes: string | null;
    createdAt: number;
  }>
> {
  const limit = normalizeLimit(input.limit, 20, 100);
  const evalScope =
    typeof input.evalScope === 'string' && ['offline', 'shadow', 'canary'].includes(input.evalScope.trim().toLowerCase())
      ? input.evalScope.trim().toLowerCase()
      : null;

  const where = ['user_id = $1'];
  const params: unknown[] = [userId];
  if (evalScope) {
    params.push(evalScope);
    where.push(`eval_scope = $${params.length}`);
  }

  params.push(limit);

  const result = await query<{
    eval_id: string;
    train_job_id: string | null;
    model_version: string;
    eval_scope: string;
    gate_result: string;
    metrics: unknown;
    notes: string | null;
    created_at: string;
  }>(
    `
      SELECT eval_id, train_job_id, model_version, eval_scope, gate_result, metrics, notes, created_at
      FROM ml_eval_reports
      WHERE ${where.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT $${params.length}
    `,
    params,
  );

  return result.rows.map((row: (typeof result.rows)[number]) => ({
    evalId: row.eval_id,
    trainJobId: row.train_job_id,
    modelVersion: row.model_version,
    evalScope: row.eval_scope,
    gateResult: row.gate_result,
    metrics: toSafeObject(row.metrics),
    notes: row.notes,
    createdAt: new Date(row.created_at).getTime(),
  }));
}

export async function listPassportReports(
  userId: string,
  input: { status?: unknown; limit?: unknown },
): Promise<
  Array<{
    reportId: string;
    reportType: string;
    modelName: string;
    modelVersion: string;
    periodStart: number;
    periodEnd: number;
    summary: string;
    status: string;
    createdAt: number;
  }>
> {
  const limit = normalizeLimit(input.limit, 20, 100);
  const status =
    typeof input.status === 'string' && ['draft', 'final', 'archived'].includes(input.status.trim().toLowerCase())
      ? input.status.trim().toLowerCase()
      : null;

  const where = ['user_id = $1'];
  const params: unknown[] = [userId];
  if (status) {
    params.push(status);
    where.push(`status = $${params.length}`);
  }

  params.push(limit);

  const result = await query<{
    report_id: string;
    report_type: string;
    model_name: string;
    model_version: string;
    period_start: string;
    period_end: string;
    summary_md: string;
    status: string;
    created_at: string;
  }>(
    `
      SELECT
        report_id,
        report_type,
        model_name,
        model_version,
        period_start,
        period_end,
        summary_md,
        status,
        created_at
      FROM passport_reports
      WHERE ${where.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT $${params.length}
    `,
    params,
  );

  return result.rows.map((row: (typeof result.rows)[number]) => ({
    reportId: row.report_id,
    reportType: row.report_type,
    modelName: row.model_name,
    modelVersion: row.model_version,
    periodStart: new Date(row.period_start).getTime(),
    periodEnd: new Date(row.period_end).getTime(),
    summary: row.summary_md,
    status: row.status,
    createdAt: new Date(row.created_at).getTime(),
  }));
}

export async function listPassportTrainJobs(
  userId: string,
  input: { limit?: unknown },
): Promise<
  Array<{
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
  }>
> {
  const limit = normalizeLimit(input.limit, 20, 100);
  const result = await query<{
    train_job_id: string;
    train_type: string;
    model_role: string;
    target_model_version: string;
    trigger_reason: string;
    status: string;
    dataset_version_ids: string[] | null;
    created_at: string;
    started_at: string | null;
    finished_at: string | null;
  }>(
    `
      SELECT
        train_job_id,
        train_type,
        model_role,
        target_model_version,
        trigger_reason,
        status,
        dataset_version_ids,
        created_at,
        started_at,
        finished_at
      FROM ml_train_jobs
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `,
    [userId, limit],
  );

  return result.rows.map((row: (typeof result.rows)[number]) => ({
    trainJobId: row.train_job_id,
    trainType: row.train_type,
    modelRole: row.model_role,
    targetModelVersion: row.target_model_version,
    triggerReason: row.trigger_reason,
    status: row.status,
    datasetVersionIds: Array.isArray(row.dataset_version_ids) ? row.dataset_version_ids : [],
    createdAt: new Date(row.created_at).getTime(),
    startedAt: row.started_at ? new Date(row.started_at).getTime() : null,
    finishedAt: row.finished_at ? new Date(row.finished_at).getTime() : null,
  }));
}

export async function createPassportTrainJob(
  userId: string,
  input: {
    trainType?: unknown;
    modelRole?: unknown;
    baseModel?: unknown;
    targetModelVersion?: unknown;
    datasetVersionIds?: unknown;
    triggerReason?: unknown;
    hyperparams?: unknown;
  },
): Promise<{
  trainJobId: string;
  trainType: string;
  modelRole: string;
  baseModel: string;
  targetModelVersion: string;
  triggerReason: string;
  status: string;
  datasetVersionIds: string[];
  hyperparams: Record<string, unknown>;
  createdAt: number;
}> {
  const trainType = normalizeTrainType(input.trainType);
  const modelRole = normalizeModelRole(input.modelRole);
  const baseModel = typeof input.baseModel === 'string' && input.baseModel.trim() ? input.baseModel.trim() : 'openai/base';
  const targetModelVersion =
    typeof input.targetModelVersion === 'string' && input.targetModelVersion.trim()
      ? input.targetModelVersion.trim()
      : `${modelRole}-${Date.now()}`;
  const triggerReason =
    typeof input.triggerReason === 'string' && input.triggerReason.trim() ? input.triggerReason.trim() : 'manual';
  const datasetVersionIds = pickDatasetVersionIds(input.datasetVersionIds);
  const hyperparams = toSafeObject(input.hyperparams);

  const result = await query<{
    train_job_id: string;
    train_type: string;
    model_role: string;
    base_model: string;
    target_model_version: string;
    trigger_reason: string;
    status: string;
    dataset_version_ids: string[] | null;
    hyperparams: unknown;
    created_at: string;
  }>(
    `
      INSERT INTO ml_train_jobs (
        user_id,
        train_type,
        model_role,
        base_model,
        target_model_version,
        dataset_version_ids,
        hyperparams,
        trigger_reason,
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6::uuid[], $7::jsonb, $8, 'queued')
      RETURNING
        train_job_id,
        train_type,
        model_role,
        base_model,
        target_model_version,
        trigger_reason,
        status,
        dataset_version_ids,
        hyperparams,
        created_at
    `,
    [
      userId,
      trainType,
      modelRole,
      baseModel,
      targetModelVersion,
      datasetVersionIds,
      JSON.stringify(hyperparams),
      triggerReason,
    ],
  );

  const row = result.rows[0];
  return {
    trainJobId: row.train_job_id,
    trainType: row.train_type,
    modelRole: row.model_role,
    baseModel: row.base_model,
    targetModelVersion: row.target_model_version,
    triggerReason: row.trigger_reason,
    status: row.status,
    datasetVersionIds: Array.isArray(row.dataset_version_ids) ? row.dataset_version_ids : [],
    hyperparams: toSafeObject(row.hyperparams),
    createdAt: new Date(row.created_at).getTime(),
  };
}

export async function createPassportReportDraft(
  userId: string,
  input: {
    reportType?: unknown;
    periodStart?: unknown;
    periodEnd?: unknown;
    modelName?: unknown;
    modelVersion?: unknown;
    inputSnapshot?: unknown;
    summary?: unknown;
  },
): Promise<{
  reportId: string;
  reportType: string;
  modelName: string;
  modelVersion: string;
  periodStart: number;
  periodEnd: number;
  summary: string;
  status: string;
  createdAt: number;
}> {
  const now = new Date();
  const defaultStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const reportType = normalizeReportType(input.reportType);
  const periodStart = normalizeIsoDate(input.periodStart, defaultStart);
  const periodEnd = normalizeIsoDate(input.periodEnd, now);
  const modelName = typeof input.modelName === 'string' && input.modelName.trim() ? input.modelName.trim() : 'passport-analyst';
  const modelVersion =
    typeof input.modelVersion === 'string' && input.modelVersion.trim() ? input.modelVersion.trim() : `draft-${Date.now()}`;
  const inputSnapshot = toSafeObject(input.inputSnapshot);
  const summary =
    typeof input.summary === 'string' && input.summary.trim()
      ? input.summary.trim()
      : `# Passport Learning Report\n\n- generated_at: ${now.toISOString()}\n- model: ${modelName}:${modelVersion}\n- note: skeleton draft`; 

  const result = await query<{
    report_id: string;
    report_type: string;
    model_name: string;
    model_version: string;
    period_start: string;
    period_end: string;
    summary_md: string;
    status: string;
    created_at: string;
  }>(
    `
      INSERT INTO passport_reports (
        user_id,
        report_type,
        period_start,
        period_end,
        model_name,
        model_version,
        input_snapshot,
        strengths,
        weaknesses,
        improvements,
        ai_training_impact,
        summary_md,
        score_overview,
        status
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7::jsonb,
        '[]'::jsonb,
        '[]'::jsonb,
        '[]'::jsonb,
        '{}'::jsonb,
        $8,
        '{}'::jsonb,
        'draft'
      )
      ON CONFLICT (user_id, report_type, period_start, period_end, model_version)
      DO UPDATE SET
        input_snapshot = EXCLUDED.input_snapshot,
        summary_md = EXCLUDED.summary_md,
        created_at = now(),
        status = 'draft'
      RETURNING
        report_id,
        report_type,
        model_name,
        model_version,
        period_start,
        period_end,
        summary_md,
        status,
        created_at
    `,
    [
      userId,
      reportType,
      periodStart.toISOString(),
      periodEnd.toISOString(),
      modelName,
      modelVersion,
      JSON.stringify(inputSnapshot),
      summary,
    ],
  );

  const row = result.rows[0];
  return {
    reportId: row.report_id,
    reportType: row.report_type,
    modelName: row.model_name,
    modelVersion: row.model_version,
    periodStart: new Date(row.period_start).getTime(),
    periodEnd: new Date(row.period_end).getTime(),
    summary: row.summary_md,
    status: row.status,
    createdAt: new Date(row.created_at).getTime(),
  };
}

interface OutboxPendingRow {
  event_id: string;
  user_id: string;
  trace_id: string;
  event_type: string;
  source_table: string;
  source_id: string;
  payload: unknown;
}

export interface PassportOutboxWorkerResult {
  workerId: string;
  claimed: number;
  processed: number;
  failed: number;
}

export async function runPassportOutboxWorker(input: {
  userId?: string;
  workerId?: string;
  limit?: unknown;
}): Promise<PassportOutboxWorkerResult> {
  const workerId = typeof input.workerId === 'string' && input.workerId.trim() ? input.workerId.trim() : `worker:${randomUUID()}`;
  const limit = normalizeLimit(input.limit, 20, 100);

  const claimedRows = await withTransaction(async (client) => {
    const rows = await client.query<OutboxPendingRow>(
      `
        SELECT event_id, user_id, trace_id, event_type, source_table, source_id, payload
        FROM passport_event_outbox
        WHERE status = 'pending'
          AND (next_retry_at IS NULL OR next_retry_at <= now())
          AND ($1::uuid IS NULL OR user_id = $1::uuid)
        ORDER BY created_at ASC
        LIMIT $2
        FOR UPDATE SKIP LOCKED
      `,
      [input.userId ?? null, limit],
    );

    const ids = rows.rows.map((row: (typeof rows.rows)[number]) => row.event_id);
    if (ids.length > 0) {
      await client.query(
        `
          UPDATE passport_event_outbox
          SET status = 'processing',
              locked_at = now(),
              locked_by = $1,
              updated_at = now()
          WHERE event_id = ANY($2::uuid[])
        `,
        [workerId, ids],
      );
    }

    return rows.rows;
  });

  let processed = 0;
  let failed = 0;

  for (const row of claimedRows) {
    try {
      const payload = toSafeObject(row.payload);
      const contextFeatures = toSafeObject(payload.context, {
        sourceTable: row.source_table,
        sourceId: row.source_id,
      });
      const decisionFeatures = toSafeObject(payload.decision, {
        eventType: row.event_type,
      });
      const outcomeFeatures = isObject(payload.outcome) ? payload.outcome : null;
      const utilityScoreRaw = typeof payload.utilityScore === 'number' ? payload.utilityScore : null;
      const utilityScore = Number.isFinite(utilityScoreRaw) ? Number(utilityScoreRaw) : null;
      const inferenceId = typeof payload.inferenceId === 'string' && UUID_RE.test(payload.inferenceId)
        ? payload.inferenceId
        : null;

      await withTransaction(async (client) => {
        await client.query(
          `
            INSERT INTO decision_trajectories (
              user_id,
              trace_id,
              source_event_id,
              inference_id,
              context_features,
              decision_features,
              outcome_features,
              utility_score,
              label_quality
            )
            VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8, 'pending')
            ON CONFLICT (source_event_id)
            DO UPDATE SET
              context_features = EXCLUDED.context_features,
              decision_features = EXCLUDED.decision_features,
              outcome_features = COALESCE(EXCLUDED.outcome_features, decision_trajectories.outcome_features),
              inference_id = COALESCE(EXCLUDED.inference_id, decision_trajectories.inference_id),
              utility_score = COALESCE(EXCLUDED.utility_score, decision_trajectories.utility_score)
          `,
          [
            row.user_id,
            row.trace_id,
            row.event_id,
            inferenceId,
            JSON.stringify(contextFeatures),
            JSON.stringify(decisionFeatures),
            JSON.stringify(outcomeFeatures),
            utilityScore,
          ],
        );

        await client.query(
          `
            UPDATE passport_event_outbox
            SET
              status = 'done',
              updated_at = now(),
              locked_at = NULL,
              locked_by = NULL,
              last_error = NULL
            WHERE event_id = $1
          `,
          [row.event_id],
        );
      });

      processed += 1;
    } catch (error) {
      failed += 1;
      const message =
        error instanceof Error
          ? error.message
          : typeof error === 'string'
            ? error
            : 'unknown outbox processing error';

      await query(
        `
          UPDATE passport_event_outbox
          SET
            retry_count = retry_count + 1,
            status = CASE WHEN retry_count + 1 >= 5 THEN 'failed' ELSE 'pending' END,
            next_retry_at = now() + (LEAST(60, (retry_count + 1) * 2) * interval '1 minute'),
            last_error = left($2, 500),
            locked_at = NULL,
            locked_by = NULL,
            updated_at = now()
          WHERE event_id = $1
        `,
        [row.event_id, message],
      );
    }
  }

  return {
    workerId,
    claimed: claimedRows.length,
    processed,
    failed,
  };
}

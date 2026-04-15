import { randomUUID } from 'node:crypto';
import type {
  TerminalAlertCreateRequest,
  TerminalAlertRule,
  TerminalExportJob,
  TerminalExportRequest,
  PatternCaptureCreateRequest,
  PatternCaptureQuery,
  PatternCaptureRecord,
  TerminalPin,
  TerminalWatchlistItem,
} from '$lib/contracts/terminalPersistence';
import { query, withTransaction } from '$lib/server/db';

type Queryable = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
};

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return new Date(value).toISOString();
  return new Date().toISOString();
}

function mapWatchlistRow(row: Record<string, unknown>): TerminalWatchlistItem {
  return {
    symbol: String(row.symbol ?? ''),
    timeframe: String(row.timeframe ?? '4h'),
    sortOrder: Number(row.sort_order ?? 0),
    active: Boolean(row.is_active),
  };
}

function mapPinRow(row: Record<string, unknown>): TerminalPin {
  return {
    id: String(row.id ?? ''),
    pinType: String(row.pin_type ?? 'analysis') as TerminalPin['pinType'],
    symbol: row.symbol ? String(row.symbol) : undefined,
    timeframe: String(row.timeframe ?? '4h'),
    label: row.label ? String(row.label) : undefined,
    payload: (row.payload as Record<string, unknown>) ?? {},
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function mapAlertRow(row: Record<string, unknown>): TerminalAlertRule {
  return {
    id: String(row.id ?? ''),
    symbol: String(row.symbol ?? ''),
    timeframe: String(row.timeframe ?? '4h'),
    kind: String(row.kind ?? ''),
    params: (row.params as Record<string, unknown>) ?? {},
    enabled: Boolean(row.enabled),
    sourceContext: (row.source_context as Record<string, unknown>) ?? {},
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function mapExportJobRow(row: Record<string, unknown>): TerminalExportJob {
  return {
    id: String(row.id ?? ''),
    exportType: String(row.export_type ?? 'terminal_report') as TerminalExportJob['exportType'],
    status: String(row.status ?? 'queued') as TerminalExportJob['status'],
    symbol: String(row.symbol ?? ''),
    timeframe: String(row.timeframe ?? '4h'),
    title: row.title ? String(row.title) : undefined,
    requestPayload: (row.request_payload as Record<string, unknown>) ?? {},
    resultPayload: (row.result_payload as Record<string, unknown> | null) ?? undefined,
    errorMessage: row.error_message ? String(row.error_message) : undefined,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    completedAt: row.completed_at ? toIso(row.completed_at) : undefined,
  };
}

function mapPatternCaptureRow(row: Record<string, unknown>): PatternCaptureRecord {
  return {
    id: String(row.id ?? ''),
    symbol: String(row.symbol ?? ''),
    timeframe: String(row.timeframe ?? '4h'),
    contextKind: String(row.context_kind ?? 'symbol') as PatternCaptureRecord['contextKind'],
    triggerOrigin: String(row.trigger_origin ?? 'manual') as PatternCaptureRecord['triggerOrigin'],
    patternSlug: row.pattern_slug ? String(row.pattern_slug) : undefined,
    reason: row.reason ? String(row.reason) : undefined,
    note: row.note ? String(row.note) : undefined,
    snapshot: (row.snapshot as PatternCaptureRecord['snapshot']) ?? {},
    decision: (row.decision as PatternCaptureRecord['decision']) ?? {},
    evidenceHash: row.evidence_hash ? String(row.evidence_hash) : undefined,
    sourceFreshness: (row.source_freshness as Record<string, string>) ?? {},
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

export async function listTerminalWatchlist(userId: string): Promise<TerminalWatchlistItem[]> {
  const result = await query(
    `
      SELECT symbol, timeframe, sort_order, is_active
      FROM terminal_watchlist
      WHERE user_id = $1
      ORDER BY sort_order ASC, updated_at DESC
    `,
    [userId],
  );
  return result.rows.map(mapWatchlistRow);
}

export async function replaceTerminalWatchlist(
  userId: string,
  items: TerminalWatchlistItem[],
  activeSymbol?: string,
): Promise<TerminalWatchlistItem[]> {
  await withTransaction(async (client) => {
    await client.query(`DELETE FROM terminal_watchlist WHERE user_id = $1`, [userId]);
    for (const item of items) {
      await client.query(
        `
          INSERT INTO terminal_watchlist (user_id, symbol, timeframe, sort_order, is_active)
          VALUES ($1, $2, $3, $4, $5)
        `,
        [userId, item.symbol, item.timeframe, item.sortOrder, item.symbol === activeSymbol || item.active],
      );
    }
  });
  return listTerminalWatchlist(userId);
}

export async function listTerminalPins(userId: string): Promise<TerminalPin[]> {
  const result = await query(
    `
      SELECT id, pin_type, symbol, timeframe, label, payload, created_at, updated_at
      FROM terminal_pins
      WHERE user_id = $1
      ORDER BY updated_at DESC
    `,
    [userId],
  );
  return result.rows.map(mapPinRow);
}

export async function replaceTerminalPins(userId: string, pins: TerminalPin[]): Promise<TerminalPin[]> {
  await withTransaction(async (client) => {
    await client.query(`DELETE FROM terminal_pins WHERE user_id = $1`, [userId]);
    for (const pin of pins) {
      await client.query(
        `
          INSERT INTO terminal_pins (
            id, user_id, pin_type, symbol, timeframe, label, payload, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::timestamptz, $9::timestamptz)
        `,
        [
          pin.id,
          userId,
          pin.pinType,
          pin.symbol ?? null,
          pin.timeframe,
          pin.label ?? null,
          JSON.stringify(pin.payload ?? {}),
          pin.createdAt,
          pin.updatedAt,
        ],
      );
    }
  });
  return listTerminalPins(userId);
}

export async function listTerminalAlerts(userId: string): Promise<TerminalAlertRule[]> {
  const result = await query(
    `
      SELECT id, symbol, timeframe, kind, params, enabled, source_context, created_at, updated_at
      FROM terminal_alert_rules
      WHERE user_id = $1
      ORDER BY updated_at DESC
    `,
    [userId],
  );
  return result.rows.map(mapAlertRow);
}

export async function upsertTerminalAlert(userId: string, input: TerminalAlertCreateRequest): Promise<TerminalAlertRule> {
  const id = randomUUID();
  const result = await query(
    `
      INSERT INTO terminal_alert_rules (
        id, user_id, symbol, timeframe, kind, params, enabled, source_context
      ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8::jsonb)
      ON CONFLICT (user_id, symbol, timeframe, kind) DO UPDATE SET
        params = EXCLUDED.params,
        enabled = EXCLUDED.enabled,
        source_context = EXCLUDED.source_context,
        updated_at = now()
      RETURNING id, symbol, timeframe, kind, params, enabled, source_context, created_at, updated_at
    `,
    [
      id,
      userId,
      input.symbol,
      input.timeframe,
      input.kind,
      JSON.stringify(input.params ?? {}),
      input.enabled,
      JSON.stringify(input.sourceContext ?? {}),
    ],
  );
  return mapAlertRow(result.rows[0] ?? {});
}

export async function deleteTerminalAlert(userId: string, id: string): Promise<boolean> {
  const result = await query(`DELETE FROM terminal_alert_rules WHERE user_id = $1 AND id = $2`, [userId, id]);
  return (result as { rowCount?: number }).rowCount ? (result as { rowCount: number }).rowCount > 0 : true;
}

export async function createTerminalExportJob(userId: string, input: TerminalExportRequest): Promise<TerminalExportJob> {
  const id = `exp-${randomUUID()}`;
  const result = await query(
    `
      INSERT INTO terminal_export_jobs (
        id, user_id, export_type, status, symbol, timeframe, title, request_payload
      ) VALUES ($1, $2, $3, 'queued', $4, $5, $6, $7::jsonb)
      RETURNING id, export_type, status, symbol, timeframe, title, request_payload, result_payload,
                error_message, created_at, updated_at, completed_at
    `,
    [id, userId, input.exportType, input.symbol, input.timeframe, input.title ?? null, JSON.stringify(input.payload ?? {})],
  );
  return mapExportJobRow(result.rows[0] ?? {});
}

export async function getTerminalExportJobForUser(userId: string, id: string): Promise<TerminalExportJob | null> {
  const result = await query(
    `
      SELECT id, export_type, status, symbol, timeframe, title, request_payload, result_payload,
             error_message, created_at, updated_at, completed_at
      FROM terminal_export_jobs
      WHERE user_id = $1 AND id = $2
      LIMIT 1
    `,
    [userId, id],
  );
  const row = result.rows[0];
  return row ? mapExportJobRow(row) : null;
}

async function getTerminalExportJobById(id: string): Promise<TerminalExportJob | null> {
  const result = await query(
    `
      SELECT id, export_type, status, symbol, timeframe, title, request_payload, result_payload,
             error_message, created_at, updated_at, completed_at
      FROM terminal_export_jobs
      WHERE id = $1
      LIMIT 1
    `,
    [id],
  );
  const row = result.rows[0];
  return row ? mapExportJobRow(row) : null;
}

function buildExportPayload(job: TerminalExportJob): Record<string, unknown> {
  const requestPayload = job.requestPayload ?? {};
  const summary = [
    `${job.symbol} ${job.timeframe.toUpperCase()} terminal report`,
    typeof requestPayload.verdict === 'string' ? `Verdict: ${requestPayload.verdict}` : null,
    typeof requestPayload.action === 'string' ? `Action: ${requestPayload.action}` : null,
    typeof requestPayload.invalidation === 'string' ? `Invalidation: ${requestPayload.invalidation}` : null,
  ].filter(Boolean);

  return {
    title: job.title ?? `${job.symbol} ${job.timeframe.toUpperCase()} report`,
    symbol: job.symbol,
    timeframe: job.timeframe,
    summary,
    data: requestPayload,
    generatedAt: new Date().toISOString(),
  };
}

export async function processTerminalExportJob(id: string): Promise<void> {
  const existing = await getTerminalExportJobById(id);
  if (!existing || existing.status !== 'queued') return;

  await query(
    `
      UPDATE terminal_export_jobs
      SET status = 'running', updated_at = now()
      WHERE id = $1
    `,
    [id],
  );

  try {
    const fresh = await getTerminalExportJobById(id);
    if (!fresh) return;
    const resultPayload = buildExportPayload(fresh);
    await query(
      `
        UPDATE terminal_export_jobs
        SET status = 'succeeded',
            result_payload = $2::jsonb,
            completed_at = now(),
            updated_at = now()
        WHERE id = $1
      `,
      [id, JSON.stringify(resultPayload)],
    );
  } catch (error) {
    await query(
      `
        UPDATE terminal_export_jobs
        SET status = 'failed',
            error_message = $2,
            updated_at = now()
        WHERE id = $1
      `,
      [id, error instanceof Error ? error.message : 'Export failed'],
    );
  }
}

export function scheduleTerminalExportJob(id: string): void {
  const timer = setTimeout(() => {
    void processTerminalExportJob(id);
  }, 0);
  if (typeof timer === 'object' && 'unref' in timer) {
    (timer as NodeJS.Timeout).unref();
  }
}

export async function createPatternCapture(
  userId: string,
  input: PatternCaptureCreateRequest
): Promise<PatternCaptureRecord> {
  const id = `pcap-${randomUUID()}`;
  const result = await query(
    `
      INSERT INTO terminal_pattern_captures (
        id, user_id, symbol, timeframe, context_kind, trigger_origin, pattern_slug, reason, note,
        snapshot, decision, evidence_hash, source_freshness
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12, $13::jsonb)
      RETURNING id, symbol, timeframe, context_kind, trigger_origin, pattern_slug, reason, note,
                snapshot, decision, evidence_hash, source_freshness, created_at, updated_at
    `,
    [
      id,
      userId,
      input.symbol,
      input.timeframe,
      input.contextKind,
      input.triggerOrigin,
      input.patternSlug ?? null,
      input.reason ?? null,
      input.note ?? null,
      JSON.stringify(input.snapshot ?? {}),
      JSON.stringify(input.decision ?? {}),
      input.evidenceHash ?? null,
      JSON.stringify(input.sourceFreshness ?? {}),
    ],
  );
  return mapPatternCaptureRow(result.rows[0] ?? {});
}

export async function listPatternCaptures(
  userId: string,
  queryInput: PatternCaptureQuery
): Promise<PatternCaptureRecord[]> {
  const where: string[] = ['user_id = $1'];
  const params: unknown[] = [userId];
  let idx = 2;

  if (queryInput.symbol) {
    where.push(`symbol = $${idx++}`);
    params.push(queryInput.symbol);
  }
  if (queryInput.timeframe) {
    where.push(`timeframe = $${idx++}`);
    params.push(queryInput.timeframe);
  }
  if (queryInput.triggerOrigin) {
    where.push(`trigger_origin = $${idx++}`);
    params.push(queryInput.triggerOrigin);
  }
  if (queryInput.verdict) {
    where.push(`decision ->> 'verdict' = $${idx++}`);
    params.push(queryInput.verdict);
  }
  params.push(queryInput.limit);

  const result = await query(
    `
      SELECT id, symbol, timeframe, context_kind, trigger_origin, pattern_slug, reason, note,
             snapshot, decision, evidence_hash, source_freshness, created_at, updated_at
      FROM terminal_pattern_captures
      WHERE ${where.join(' AND ')}
      ORDER BY updated_at DESC
      LIMIT $${idx}
    `,
    params,
  );
  return result.rows.map(mapPatternCaptureRow);
}

import { query } from '$lib/server/db';

interface Queryable {
  query: (text: string, params?: unknown[]) => Promise<{ rows: Array<{ event_id: string }> }>;
}

const SKIPPABLE_CODES = new Set(['42P01', '42703', '42883', '23505']);

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isSkippableOutboxError(error: unknown): boolean {
  const code =
    typeof error === 'object' && error && 'code' in error && typeof (error as { code?: unknown }).code === 'string'
      ? ((error as { code: string }).code)
      : '';
  return SKIPPABLE_CODES.has(code);
}

function sanitizeTraceId(value: string | undefined, fallback: string): string {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) return fallback;
  return trimmed.slice(0, 160);
}

function buildIdempotencyKey(
  eventType: string,
  sourceTable: string,
  sourceId: string,
  explicit?: string,
): string {
  const value = typeof explicit === 'string' ? explicit.trim() : '';
  if (value) return value.slice(0, 200);
  return `${eventType}:${sourceTable}:${sourceId}`.slice(0, 200);
}

export interface PassportOutboxEventInput {
  userId: string;
  eventType: string;
  sourceTable: string;
  sourceId: string;
  traceId?: string;
  idempotencyKey?: string;
  payload?: unknown;
}

export async function enqueuePassportEvent(
  input: PassportOutboxEventInput,
  client?: Queryable,
): Promise<string> {
  const runner: Queryable = client ?? { query };
  const eventType = input.eventType.trim().toLowerCase();
  const sourceTable = input.sourceTable.trim().toLowerCase();
  const sourceId = input.sourceId.trim();
  const fallbackTrace = `${sourceTable}:${sourceId}`;

  const payload = isObject(input.payload) ? input.payload : {};

  const result = await runner.query(
    `
      INSERT INTO passport_event_outbox (
        user_id,
        trace_id,
        event_type,
        source_table,
        source_id,
        idempotency_key,
        payload
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
      RETURNING event_id
    `,
    [
      input.userId,
      sanitizeTraceId(input.traceId, fallbackTrace),
      eventType,
      sourceTable,
      sourceId,
      buildIdempotencyKey(eventType, sourceTable, sourceId, input.idempotencyKey),
      JSON.stringify(payload),
    ],
  );

  return result.rows[0]?.event_id ?? '';
}

export async function enqueuePassportEventBestEffort(
  input: PassportOutboxEventInput,
  client?: Queryable,
): Promise<string | null> {
  try {
    const eventId = await enqueuePassportEvent(input, client);
    return eventId || null;
  } catch (error) {
    if (isSkippableOutboxError(error)) {
      console.warn('[passportOutbox] skip enqueue (schema/duplicate):', (error as { code?: string }).code ?? 'unknown');
      return null;
    }
    console.error('[passportOutbox] enqueue failed:', error);
    return null;
  }
}

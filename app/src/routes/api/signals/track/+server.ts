import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import {
  normalizePair,
  normalizeTradeDir,
  PAIR_RE,
  toBoundedInt,
  toPositiveNumber,
} from '$lib/server/apiValidation';
import { enqueuePassportEventBestEffort } from '$lib/server/passportOutbox';

interface TrackedSignalRow {
  id: string;
  user_id: string;
  pair: string;
  dir: 'LONG' | 'SHORT';
  confidence: number;
  entry_price: number;
  current_price: number;
  pnl_percent: number;
  status: 'tracking' | 'expired' | 'converted';
  source: string | null;
  note: string | null;
  tracked_at: string;
  expires_at: string;
}

function mapSignal(row: TrackedSignalRow) {
  return {
    id: row.id,
    userId: row.user_id,
    pair: row.pair,
    dir: row.dir,
    confidence: Number(row.confidence ?? 0),
    entryPrice: Number(row.entry_price),
    currentPrice: Number(row.current_price),
    pnlPercent: Number(row.pnl_percent ?? 0),
    status: row.status,
    source: row.source || 'manual',
    note: row.note || '',
    trackedAt: new Date(row.tracked_at).getTime(),
    expiresAt: new Date(row.expires_at).getTime(),
  };
}

export const POST: RequestHandler = async ({ cookies, request }) => {
  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });

    const body = await request.json();
    const pair = normalizePair(body?.pair);
    const dir = normalizeTradeDir(body?.dir);
    const confidence = toBoundedInt(body?.confidence, 70, 1, 100);
    const entryPrice = toPositiveNumber(body?.entryPrice, 0);
    const currentPrice = toPositiveNumber(body?.currentPrice, entryPrice);
    const source = typeof body?.source === 'string' ? body.source.trim() : 'manual';
    const note = typeof body?.note === 'string' ? body.note.trim() : '';

    const ttlHours = toBoundedInt(body?.ttlHours, 24, 1, 168);
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString();

    if (!PAIR_RE.test(pair)) return json({ error: 'Invalid pair format' }, { status: 400 });
    if (!dir) return json({ error: 'dir must be LONG or SHORT' }, { status: 400 });
    if (entryPrice <= 0) return json({ error: 'entryPrice must be greater than 0' }, { status: 400 });

    const result = await query<TrackedSignalRow>(
      `
        INSERT INTO tracked_signals (
          user_id, pair, dir, confidence, entry_price, current_price,
          pnl_percent, status, source, note, tracked_at, expires_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, 0, 'tracking', $7, $8, now(), $9::timestamptz)
        RETURNING
          id, user_id, pair, dir, confidence, entry_price, current_price,
          pnl_percent, status, source, note, tracked_at, expires_at
      `,
      [user.id, pair, dir, confidence, entryPrice, currentPrice, source, note, expiresAt]
    );

    await query(
      `
        INSERT INTO signal_actions (user_id, signal_id, pair, dir, action_type, source, confidence, payload)
        VALUES ($1, $2, $3, $4, 'track', $5, $6, $7::jsonb)
      `,
      [user.id, result.rows[0].id, pair, dir, source, confidence, JSON.stringify({ note })]
    ).catch(() => undefined);

    const signal = mapSignal(result.rows[0]);

    await enqueuePassportEventBestEffort({
      userId: user.id,
      eventType: 'signal_tracked',
      sourceTable: 'tracked_signals',
      sourceId: signal.id,
      traceId: `signal:${signal.id}`,
      idempotencyKey: `signal_tracked:${signal.id}`,
      payload: {
        context: {
          pair: signal.pair,
          source: signal.source,
          ttlHours,
        },
        decision: {
          dir: signal.dir,
          confidence: signal.confidence,
          entryPrice: signal.entryPrice,
        },
      },
    });

    return json({ success: true, signal });
  } catch (error: any) {
    if (typeof error?.message === 'string' && error.message.includes('DATABASE_URL is not set')) {
      return json({ error: 'Server database is not configured' }, { status: 500 });
    }
    if (error instanceof SyntaxError) return json({ error: 'Invalid request body' }, { status: 400 });
    console.error('[signals/track] unexpected error:', error);
    return json({ error: 'Failed to track signal' }, { status: 500 });
  }
};

/**
 * GET /api/cogochi/alerts
 *
 * Returns the most recent scanner alerts from the engine_alerts Supabase table.
 * The Python background scanner (APScheduler, 15-min interval) writes here whenever
 * a symbol fires ≥1 building block trigger.
 *
 * Query params:
 *   limit   — max rows (default 20, max 100)
 *   symbol  — filter by specific symbol (optional)
 *   since   — ISO timestamp lower bound (optional)
 *
 * Response: { alerts: AlertRow[], total: number, scanned_at: string }
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db';
import { terminalReadLimiter } from '$lib/server/rateLimit';

const VALID_SYMBOL = /^[A-Z0-9]{2,20}$/;

export interface AlertRow {
  id: string;
  symbol: string;
  timeframe: string;
  blocks_triggered: string[];
  p_win: number | null;
  created_at: string;
  /** Subset of snapshot fields for quick display */
  preview: {
    price?: number;
    rsi14?: number;
    funding_rate?: number;
    regime?: string;
    cvd_state?: string;
  };
}

export const GET: RequestHandler = async ({ url, getClientAddress }) => {
  if (!terminalReadLimiter.check(getClientAddress())) {
    return json({ error: 'Too many requests' }, { status: 429 });
  }

  const limitRaw = Number(url.searchParams.get('limit') ?? '20');
  const limit = Math.min(Math.max(1, limitRaw), 100);
  const symbolRaw = url.searchParams.get('symbol') ?? null;
  const since  = url.searchParams.get('since')  ?? null;

  const symbol = symbolRaw ? symbolRaw.toUpperCase() : null;
  if (symbol && !VALID_SYMBOL.test(symbol)) {
    return json({ error: 'Invalid symbol' }, { status: 400 });
  }
  if (since && isNaN(Date.parse(since))) {
    return json({ error: 'Invalid since date' }, { status: 400 });
  }

  try {
    // Build WHERE clauses
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (symbol) {
      params.push(symbol);
      conditions.push(`symbol = $${params.length}`);
    }
    if (since) {
      params.push(since);
      conditions.push(`scanned_at >= $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    params.push(limit);
    const rows = await query<{
      id: string;
      symbol: string;
      timeframe: string;
      blocks_triggered: string[];
      p_win: number | null;
      created_at: string;
      snapshot: Record<string, unknown> | null;
    }>(
      `SELECT id, symbol, timeframe, blocks_triggered, p_win, scanned_at AS created_at, snapshot
       FROM engine_alerts
       ${where}
       ORDER BY scanned_at DESC
       LIMIT $${params.length}`,
      params,
    );

    const alerts: AlertRow[] = rows.rows.map((r: {
      id: string;
      symbol: string;
      timeframe: string;
      blocks_triggered: string[];
      p_win: number | null;
      created_at: string;
      snapshot: Record<string, unknown> | null;
    }) => {
      const snap = r.snapshot ?? {};
      return {
        id:               r.id,
        symbol:           r.symbol,
        timeframe:        r.timeframe,
        blocks_triggered: r.blocks_triggered ?? [],
        p_win:            r.p_win,
        created_at:       r.created_at,
        preview: {
          price:        snap.price as number | undefined,
          rsi14:        snap.rsi14 as number | undefined,
          funding_rate: snap.funding_rate as number | undefined,
          regime:       snap.regime as string | undefined,
          cvd_state:    snap.cvd_state as string | undefined,
        },
      };
    });

    return json({
      alerts,
      total:      alerts.length,
      scanned_at: new Date().toISOString(),
    });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'DB query failed';
    console.error('[alerts] DB error:', msg);
    // Return empty gracefully — alerts are non-critical
    return json({ alerts: [], total: 0, scanned_at: new Date().toISOString(), error: msg });
  }
};

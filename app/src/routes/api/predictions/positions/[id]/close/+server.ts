import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { toNumber, UUID_RE } from '$lib/server/apiValidation';
import { errorContains } from '$lib/utils/errorUtils';

export const POST: RequestHandler = async ({ cookies, request, params }) => {
  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });

    const id = params.id;
    if (!id || !UUID_RE.test(id)) return json({ error: 'Invalid position id' }, { status: 400 });

    const body = await request.json().catch(() => ({}));

    const found = await query<{ id: string; entry_odds: number | null; current_odds: number | null; amount: number; direction: 'YES' | 'NO'; settled: boolean }>(
      `
        SELECT id, entry_odds, current_odds, amount, direction, settled
        FROM predictions
        WHERE id = $1 AND user_id = $2
        LIMIT 1
      `,
      [id, user.id]
    );

    const row = found.rows[0];
    if (!row) return json({ error: 'Prediction position not found' }, { status: 404 });
    if (row.settled) return json({ error: 'Position is already settled' }, { status: 409 });

    const closeOdds = toNumber(body?.closeOdds, row.current_odds ?? row.entry_odds ?? 0);
    const settledOutcome = typeof body?.outcome === 'string' ? body.outcome.trim().toUpperCase() : '';

    let pnl: number | null = null;
    if (settledOutcome === 'YES' || settledOutcome === 'NO') {
      pnl = settledOutcome === row.direction ? Number(row.amount) : Number(-row.amount);
    } else if (Number.isFinite(closeOdds) && Number.isFinite(row.entry_odds ?? NaN)) {
      pnl = Number(((closeOdds - Number(row.entry_odds)) * Number(row.amount)).toFixed(6));
    }

    const updated = await query(
      `
        UPDATE predictions
        SET
          current_odds = $1,
          settled = true,
          pnl = $2
        WHERE id = $3 AND user_id = $4
        RETURNING id, market_id, direction, amount, current_odds, settled, pnl, created_at
      `,
      [Number.isFinite(closeOdds) ? closeOdds : null, pnl, id, user.id]
    );

    await query(
      `
        INSERT INTO activity_events (user_id, event_type, source_page, source_id, severity, payload)
        VALUES ($1, 'prediction_closed', 'terminal', $2, 'info', $3::jsonb)
      `,
      [user.id, id, JSON.stringify({ pnl, outcome: settledOutcome || null })]
    ).catch(() => undefined);

    if (pnl != null) {
      await query(
        `
          INSERT INTO pnl_entries (user_id, source, source_id, pnl, details, created_at)
          VALUES ($1, 'predict', $2, $3, $4, now())
        `,
        [user.id, id, pnl, 'Prediction position settled']
      ).catch(() => undefined);
    }

    return json({
      success: true,
      position: {
        id: updated.rows[0].id,
        marketId: updated.rows[0].market_id,
        direction: updated.rows[0].direction,
        amount: Number(updated.rows[0].amount ?? 0),
        currentOdds: updated.rows[0].current_odds,
        settled: updated.rows[0].settled,
        pnl: updated.rows[0].pnl,
        createdAt: new Date(updated.rows[0].created_at).getTime(),
      },
    });
  } catch (error: unknown) {
    if (errorContains(error, 'DATABASE_URL is not set')) {
      return json({ error: 'Server database is not configured' }, { status: 500 });
    }
    console.error('[predictions/positions/close] unexpected error:', error);
    return json({ error: 'Failed to close prediction position' }, { status: 500 });
  }
};

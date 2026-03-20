import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { toNumber } from '$lib/server/apiValidation';
import { errorContains } from '$lib/utils/errorUtils';

function normalizeDirection(value: unknown): 'YES' | 'NO' | '' {
  if (typeof value !== 'string') return '';
  const v = value.trim().toUpperCase();
  return v === 'YES' || v === 'NO' ? v : '';
}

export const POST: RequestHandler = async ({ cookies, request }) => {
  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });

    const body = await request.json();
    const marketId = typeof body?.marketId === 'string' ? body.marketId.trim() : '';
    const marketTitle = typeof body?.marketTitle === 'string' ? body.marketTitle.trim() : '';
    const direction = normalizeDirection(body?.direction);
    const amount = toNumber(body?.amount, NaN);
    const entryOdds = toNumber(body?.entryOdds, NaN);
    const currentOdds = toNumber(body?.currentOdds, entryOdds);

    if (!marketId) return json({ error: 'marketId is required' }, { status: 400 });
    if (!direction) return json({ error: 'direction must be YES or NO' }, { status: 400 });
    if (!Number.isFinite(amount) || amount <= 0) return json({ error: 'amount must be greater than 0' }, { status: 400 });

    const result = await query(
      `
        INSERT INTO predictions (
          user_id, market_id, market_title, direction,
          entry_odds, amount, current_odds, settled, pnl, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, false, null, now())
        RETURNING
          id, user_id, market_id, market_title, direction,
          entry_odds, amount, current_odds, settled, pnl, created_at
      `,
      [
        user.id,
        marketId,
        marketTitle || null,
        direction,
        Number.isFinite(entryOdds) ? entryOdds : null,
        amount,
        Number.isFinite(currentOdds) ? currentOdds : null,
      ]
    );

    await query(
      `
        INSERT INTO activity_events (user_id, event_type, source_page, source_id, severity, payload)
        VALUES ($1, 'prediction_opened', 'terminal', $2, 'info', $3::jsonb)
      `,
      [user.id, result.rows[0].id, JSON.stringify({ marketId, direction, amount })]
    ).catch(() => undefined);

    return json({
      success: true,
      position: {
        id: result.rows[0].id,
        marketId: result.rows[0].market_id,
        marketTitle: result.rows[0].market_title,
        direction: result.rows[0].direction,
        entryOdds: result.rows[0].entry_odds,
        amount: Number(result.rows[0].amount ?? 0),
        currentOdds: result.rows[0].current_odds,
        settled: result.rows[0].settled,
        pnl: result.rows[0].pnl,
        createdAt: new Date(result.rows[0].created_at).getTime(),
      },
    });
  } catch (error: unknown) {
    if (errorContains(error, 'DATABASE_URL is not set')) {
      return json({ error: 'Server database is not configured' }, { status: 500 });
    }
    if (error instanceof SyntaxError) return json({ error: 'Invalid request body' }, { status: 400 });
    console.error('[predictions/positions/open] unexpected error:', error);
    return json({ error: 'Failed to open prediction position' }, { status: 500 });
  }
};

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
    const entryOdds = toNumber(body?.entryOdds, NaN);

    if (!marketId) return json({ error: 'marketId is required' }, { status: 400 });
    if (!direction) return json({ error: 'direction must be YES or NO' }, { status: 400 });

    const result = await query(
      `
        INSERT INTO predictions (
          user_id, market_id, market_title, direction,
          entry_odds, amount, current_odds, settled, pnl, created_at
        )
        VALUES ($1, $2, $3, $4, $5, 0, $5, false, null, now())
        RETURNING id, market_id, direction, entry_odds, amount, settled, created_at
      `,
      [user.id, marketId, marketTitle || null, direction, Number.isFinite(entryOdds) ? entryOdds : null]
    );

    await query(
      `
        INSERT INTO activity_events (user_id, event_type, source_page, source_id, severity, payload)
        VALUES ($1, 'prediction_voted', 'terminal', $2, 'info', $3::jsonb)
      `,
      [user.id, result.rows[0].id, JSON.stringify({ marketId, direction })]
    ).catch(() => undefined);

    return json({
      success: true,
      vote: {
        id: result.rows[0].id,
        marketId: result.rows[0].market_id,
        direction: result.rows[0].direction,
        entryOdds: result.rows[0].entry_odds,
        amount: Number(result.rows[0].amount ?? 0),
        settled: result.rows[0].settled,
        createdAt: new Date(result.rows[0].created_at).getTime(),
      },
    });
  } catch (error: unknown) {
    if (errorContains(error, 'DATABASE_URL is not set')) {
      return json({ error: 'Server database is not configured' }, { status: 500 });
    }
    if (error instanceof SyntaxError) return json({ error: 'Invalid request body' }, { status: 400 });
    console.error('[predictions/vote] unexpected error:', error);
    return json({ error: 'Failed to submit prediction vote' }, { status: 500 });
  }
};

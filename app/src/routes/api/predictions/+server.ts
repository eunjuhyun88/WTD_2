import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { toBoundedInt } from '$lib/server/apiValidation';
import { errorContains } from '$lib/utils/errorUtils';

interface PredictionRow {
  id: string;
  user_id: string;
  market_id: string;
  market_title: string | null;
  direction: 'YES' | 'NO';
  entry_odds: number | null;
  amount: number;
  current_odds: number | null;
  settled: boolean;
  pnl: number | null;
  created_at: string;
}

function mapPrediction(row: PredictionRow) {
  return {
    id: row.id,
    userId: row.user_id,
    marketId: row.market_id,
    marketTitle: row.market_title || '',
    direction: row.direction,
    entryOdds: row.entry_odds == null ? null : Number(row.entry_odds),
    amount: Number(row.amount ?? 0),
    currentOdds: row.current_odds == null ? null : Number(row.current_odds),
    settled: Boolean(row.settled),
    pnl: row.pnl == null ? null : Number(row.pnl),
    createdAt: new Date(row.created_at).getTime(),
  };
}

export const GET: RequestHandler = async ({ cookies, url }) => {
  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });

    const limit = toBoundedInt(url.searchParams.get('limit'), 50, 1, 200);
    const offset = toBoundedInt(url.searchParams.get('offset'), 0, 0, 5000);
    const settledParam = (url.searchParams.get('settled') || '').trim().toLowerCase();

    const settledFilter = settledParam === 'true' || settledParam === 'false';
    const settled = settledParam === 'true';
    const where = settledFilter ? 'AND settled = $2' : '';

    const countParams = settledFilter ? [user.id, settled] : [user.id];
    const listParams = settledFilter ? [user.id, settled, limit, offset] : [user.id, limit, offset];

    const total = await query<{ total: string }>(
      `SELECT count(*)::text AS total FROM predictions WHERE user_id = $1 ${where}`,
      countParams
    );

    const rows = await query<PredictionRow>(
      `
        SELECT
          id, user_id, market_id, market_title, direction,
          entry_odds, amount, current_odds, settled, pnl, created_at
        FROM predictions
        WHERE user_id = $1
        ${where}
        ORDER BY created_at DESC
        LIMIT $${settledFilter ? 3 : 2}
        OFFSET $${settledFilter ? 4 : 3}
      `,
      listParams
    );

    return json({
      success: true,
      total: Number(total.rows[0]?.total ?? '0'),
      records: rows.rows.map(mapPrediction),
      pagination: { limit, offset },
    });
  } catch (error: unknown) {
    if (errorContains(error, 'DATABASE_URL is not set')) {
      return json({ error: 'Server database is not configured' }, { status: 500 });
    }
    console.error('[predictions/get] unexpected error:', error);
    return json({ error: 'Failed to load predictions' }, { status: 500 });
  }
};

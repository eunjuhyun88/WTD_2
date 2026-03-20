import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { toBoundedInt } from '$lib/server/apiValidation';
import { errorContains } from '$lib/utils/errorUtils';

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

export const GET: RequestHandler = async ({ cookies, url }) => {
  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });

    const limit = toBoundedInt(url.searchParams.get('limit'), 50, 1, 200);
    const offset = toBoundedInt(url.searchParams.get('offset'), 0, 0, 5000);
    const status = (url.searchParams.get('status') || '').trim();

    const statusFilter = status ? 'AND status = $2' : '';
    const countParams = status ? [user.id, status] : [user.id];
    const listParams = status ? [user.id, status, limit, offset] : [user.id, limit, offset];

    const totalResult = await query<{ total: string }>(
      `SELECT count(*)::text AS total FROM tracked_signals WHERE user_id = $1 ${statusFilter}`,
      countParams
    );

    const rows = await query<TrackedSignalRow>(
      `
        SELECT
          id, user_id, pair, dir, confidence, entry_price, current_price,
          pnl_percent, status, source, note, tracked_at, expires_at
        FROM tracked_signals
        WHERE user_id = $1
        ${statusFilter}
        ORDER BY tracked_at DESC
        LIMIT $${status ? 3 : 2}
        OFFSET $${status ? 4 : 3}
      `,
      listParams
    );

    return json({
      success: true,
      total: Number(totalResult.rows[0]?.total ?? '0'),
      records: rows.rows.map(mapSignal),
      pagination: { limit, offset },
    });
  } catch (error: unknown) {
    if (errorContains(error, 'DATABASE_URL is not set')) {
      return json({ error: 'Server database is not configured' }, { status: 500 });
    }
    console.error('[signals/get] unexpected error:', error);
    return json({ error: 'Failed to load tracked signals' }, { status: 500 });
  }
};

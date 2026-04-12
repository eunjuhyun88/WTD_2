import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { errorContains } from '$lib/utils/errorUtils';

interface AggregateRow {
  source: string | null;
  total: string;
  count: string;
}

export const GET: RequestHandler = async ({ cookies }) => {
  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });

    const [totalResult, bySource] = await Promise.all([
      query<{ total: string; count: string }>(
        `SELECT COALESCE(sum(pnl), 0)::text AS total, count(*)::text AS count
         FROM pnl_entries WHERE user_id = $1`,
        [user.id]
      ),
      query<AggregateRow>(
        `SELECT source, COALESCE(sum(pnl), 0)::text AS total, count(*)::text AS count
         FROM pnl_entries WHERE user_id = $1 GROUP BY source ORDER BY source`,
        [user.id]
      ),
    ]);

    return json({
      success: true,
      total: Number(totalResult.rows[0]?.total ?? '0'),
      count: Number(totalResult.rows[0]?.count ?? '0'),
      bySource: bySource.rows.map((r: AggregateRow) => ({
        source: r.source,
        total: Number(r.total),
        count: Number(r.count),
      })),
    });
  } catch (error: unknown) {
    if (errorContains(error, 'DATABASE_URL is not set')) {
      return json({ error: 'Server database is not configured' }, { status: 500 });
    }
    console.error('[pnl/summary] unexpected error:', error);
    return json({ error: 'Failed to load pnl summary' }, { status: 500 });
  }
};

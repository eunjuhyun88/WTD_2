import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { toBoundedInt, toNumber } from '$lib/server/apiValidation';
import { errorContains } from '$lib/utils/errorUtils';

interface PnLRow {
  id: string;
  user_id: string;
  source: 'arena' | 'predict' | 'trade';
  source_id: string | null;
  pnl: number;
  details: string | null;
  created_at: string;
}

function mapRow(row: PnLRow) {
  return {
    id: row.id,
    userId: row.user_id,
    source: row.source,
    sourceId: row.source_id,
    pnl: Number(row.pnl),
    details: row.details || '',
    createdAt: new Date(row.created_at).getTime(),
  };
}

export const GET: RequestHandler = async ({ cookies, url }) => {
  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });

    const limit = toBoundedInt(url.searchParams.get('limit'), 50, 1, 200);
    const offset = toBoundedInt(url.searchParams.get('offset'), 0, 0, 5000);

    const total = await query<{ total: string }>(
      `SELECT count(*)::text AS total FROM pnl_entries WHERE user_id = $1`,
      [user.id]
    );

    const rows = await query<PnLRow>(
      `
        SELECT id, user_id, source, source_id, pnl, details, created_at
        FROM pnl_entries
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3
      `,
      [user.id, limit, offset]
    );

    return json({
      success: true,
      total: Number(total.rows[0]?.total ?? '0'),
      records: rows.rows.map(mapRow),
      pagination: { limit, offset },
    });
  } catch (error: unknown) {
    if (errorContains(error, 'DATABASE_URL is not set')) {
      return json({ error: 'Server database is not configured' }, { status: 500 });
    }
    console.error('[pnl/get] unexpected error:', error);
    return json({ error: 'Failed to load pnl entries' }, { status: 500 });
  }
};

export const POST: RequestHandler = async ({ cookies, request }) => {
  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });

    const body = await request.json();
    const source = typeof body?.source === 'string' ? body.source.trim().toLowerCase() : '';
    const sourceId = typeof body?.sourceId === 'string' ? body.sourceId.trim() : null;
    const pnl = toNumber(body?.pnl, NaN);
    const details = typeof body?.details === 'string' ? body.details.trim() : '';

    if (!['arena', 'predict', 'trade'].includes(source)) {
      return json({ error: 'source must be one of arena|predict|trade' }, { status: 400 });
    }
    if (!Number.isFinite(pnl)) {
      return json({ error: 'pnl must be a number' }, { status: 400 });
    }

    const result = await query<PnLRow>(
      `
        INSERT INTO pnl_entries (user_id, source, source_id, pnl, details, created_at)
        VALUES ($1, $2, $3, $4, $5, now())
        RETURNING id, user_id, source, source_id, pnl, details, created_at
      `,
      [user.id, source, sourceId, pnl, details]
    );

    return json({ success: true, entry: mapRow(result.rows[0]) });
  } catch (error: unknown) {
    if (errorContains(error, 'DATABASE_URL is not set')) {
      return json({ error: 'Server database is not configured' }, { status: 500 });
    }
    if (error instanceof SyntaxError) return json({ error: 'Invalid request body' }, { status: 400 });
    console.error('[pnl/post] unexpected error:', error);
    return json({ error: 'Failed to create pnl entry' }, { status: 500 });
  }
};

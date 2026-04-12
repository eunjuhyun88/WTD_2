import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { toBoundedInt } from '$lib/server/apiValidation';
import { errorContains } from '$lib/utils/errorUtils';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(row: Record<string, any>) {
  return {
    id: row.id,
    userId: row.user_id,
    eventType: row.event_type,
    sourcePage: row.source_page,
    sourceId: row.source_id,
    severity: row.severity,
    payload: row.payload ?? {},
    createdAt: new Date(row.created_at).getTime(),
  };
}

export const GET: RequestHandler = async ({ cookies, url }) => {
  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });

    const limit = toBoundedInt(url.searchParams.get('limit'), 50, 1, 100);
    const offset = toBoundedInt(url.searchParams.get('offset'), 0, 0, 1000);
    const eventType = (url.searchParams.get('eventType') || '').trim();
    const sourcePage = (url.searchParams.get('sourcePage') || '').trim();

    const whereClauses = ['user_id = $1'];
    const params: unknown[] = [user.id];

    if (eventType) {
      params.push(eventType);
      whereClauses.push(`event_type = $${params.length}`);
    }
    if (sourcePage) {
      params.push(sourcePage);
      whereClauses.push(`source_page = $${params.length}`);
    }

    const where = whereClauses.join(' AND ');

    const count = await query<{ total: string }>(
      `SELECT count(*)::text AS total FROM activity_events WHERE ${where}`,
      params
    );

    const rows = await query(
      `
        SELECT
          id, user_id, event_type, source_page,
          source_id, severity, payload, created_at
        FROM activity_events
        WHERE ${where}
        ORDER BY created_at DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `,
      [...params, limit, offset]
    );

    return json({
      success: true,
      total: Number(count.rows[0]?.total ?? '0'),
      records: rows.rows.map(mapRow),
      pagination: { limit, offset },
    });
  } catch (error: unknown) {
    if (errorContains(error, 'DATABASE_URL is not set')) {
      return json({ error: 'Server database is not configured' }, { status: 500 });
    }
    console.error('[activity/get] unexpected error:', error);
    return json({ error: 'Failed to load activity feed' }, { status: 500 });
  }
};

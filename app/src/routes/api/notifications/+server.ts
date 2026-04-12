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
    type: row.type,
    title: row.title,
    body: row.body,
    isRead: Boolean(row.is_read),
    dismissable: Boolean(row.dismissable),
    createdAt: new Date(row.created_at).getTime(),
    readAt: row.read_at ? new Date(row.read_at).getTime() : null,
  };
}

export const GET: RequestHandler = async ({ cookies, url }) => {
  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });

    const limit = toBoundedInt(url.searchParams.get('limit'), 50, 1, 100);
    const offset = toBoundedInt(url.searchParams.get('offset'), 0, 0, 1000);
    const unreadOnly = (url.searchParams.get('unreadOnly') || '').toLowerCase() === 'true';

    const where = unreadOnly ? 'AND is_read = false' : '';

    const total = await query<{ total: string }>(
      `SELECT count(*)::text AS total FROM user_notifications WHERE user_id = $1 ${where}`,
      [user.id]
    );

    const rows = await query(
      `
        SELECT
          id, user_id, type, title, body,
          is_read, dismissable, created_at, read_at
        FROM user_notifications
        WHERE user_id = $1
        ${where}
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
    console.error('[notifications/get] unexpected error:', error);
    return json({ error: 'Failed to load notifications' }, { status: 500 });
  }
};

export const POST: RequestHandler = async ({ cookies, request }) => {
  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });

    const body = await request.json();
    const type = typeof body?.type === 'string' ? body.type.trim().toLowerCase() : '';
    const title = typeof body?.title === 'string' ? body.title.trim() : '';
    const message = typeof body?.body === 'string' ? body.body.trim() : '';
    const dismissable = typeof body?.dismissable === 'boolean' ? body.dismissable : true;
    const allowedType = new Set(['alert', 'critical', 'info', 'success']);

    if (!allowedType.has(type)) {
      return json({ error: 'type must be alert|critical|info|success' }, { status: 400 });
    }
    if (title.length < 2) {
      return json({ error: 'title must be at least 2 chars' }, { status: 400 });
    }
    if (message.length < 2) {
      return json({ error: 'body must be at least 2 chars' }, { status: 400 });
    }

    const result = await query(
      `
        INSERT INTO user_notifications (
          user_id, type, title, body, is_read, dismissable, created_at, read_at
        )
        VALUES ($1, $2, $3, $4, false, $5, now(), null)
        RETURNING
          id, user_id, type, title, body,
          is_read, dismissable, created_at, read_at
      `,
      [user.id, type, title, message, dismissable]
    );

    return json({
      success: true,
      notification: mapRow(result.rows[0]),
    });
  } catch (error: unknown) {
    if (errorContains(error, 'DATABASE_URL is not set')) {
      return json({ error: 'Server database is not configured' }, { status: 500 });
    }
    if (error instanceof SyntaxError) return json({ error: 'Invalid request body' }, { status: 400 });
    console.error('[notifications/post] unexpected error:', error);
    return json({ error: 'Failed to create notification' }, { status: 500 });
  }
};

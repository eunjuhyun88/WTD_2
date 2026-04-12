import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { UUID_RE } from '$lib/server/apiValidation';
import { errorContains } from '$lib/utils/errorUtils';

export const POST: RequestHandler = async ({ cookies, request }) => {
  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const idsRaw = Array.isArray(body?.ids) ? body.ids : null;

    if (!idsRaw || idsRaw.length === 0) {
      const result = await query(
        `
          UPDATE user_notifications
          SET is_read = true, read_at = now()
          WHERE user_id = $1 AND is_read = false
        `,
        [user.id]
      );
      return json({ success: true, updated: result.rowCount });
    }

    const ids = idsRaw.filter((v: unknown) => typeof v === 'string' && UUID_RE.test(v));
    if (ids.length === 0) return json({ error: 'No valid notification ids' }, { status: 400 });

    const result = await query(
      `
        UPDATE user_notifications
        SET is_read = true, read_at = now()
        WHERE user_id = $1
          AND id = ANY($2::uuid[])
      `,
      [user.id, ids]
    );

    return json({ success: true, updated: result.rowCount });
  } catch (error: unknown) {
    if (errorContains(error, 'DATABASE_URL is not set')) {
      return json({ error: 'Server database is not configured' }, { status: 500 });
    }
    console.error('[notifications/read] unexpected error:', error);
    return json({ error: 'Failed to mark notifications as read' }, { status: 500 });
  }
};

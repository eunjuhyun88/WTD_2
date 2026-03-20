import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { UUID_RE } from '$lib/server/apiValidation';
import { errorContains } from '$lib/utils/errorUtils';

export const DELETE: RequestHandler = async ({ cookies, params }) => {
  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });

    const id = params.id;
    if (!id || !UUID_RE.test(id)) return json({ error: 'Invalid notification id' }, { status: 400 });

    const result = await query(
      `DELETE FROM user_notifications WHERE user_id = $1 AND id = $2`,
      [user.id, id]
    );

    if (!result.rowCount) return json({ error: 'Notification not found' }, { status: 404 });
    return json({ success: true, deleted: true });
  } catch (error: unknown) {
    if (errorContains(error, 'DATABASE_URL is not set')) {
      return json({ error: 'Server database is not configured' }, { status: 500 });
    }
    console.error('[notifications/delete] unexpected error:', error);
    return json({ error: 'Failed to delete notification' }, { status: 500 });
  }
};

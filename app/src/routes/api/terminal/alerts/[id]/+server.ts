import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { deleteTerminalAlert } from '$lib/server/terminalPersistence';
import { errorContains } from '$lib/utils/errorUtils';

export const DELETE: RequestHandler = async ({ cookies, params }) => {
  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });
    if (!params.id) return json({ error: 'Alert id is required' }, { status: 400 });

    const deleted = await deleteTerminalAlert(user.id, params.id);
    return json({ ok: true, deleted });
  } catch (error: unknown) {
    if (errorContains(error, 'DATABASE_URL is not set')) {
      return json({ error: 'Server database is not configured' }, { status: 500 });
    }
    console.error('[terminal/alerts/delete] unexpected error:', error);
    return json({ error: 'Failed to delete alert' }, { status: 500 });
  }
};

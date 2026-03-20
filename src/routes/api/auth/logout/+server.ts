import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db';
import { parseSessionCookie, SESSION_COOKIE_NAME } from '$lib/server/session';
import { errorContains } from '$lib/utils/errorUtils';

export const POST: RequestHandler = async ({ cookies }) => {
  try {
    const sessionCookie = cookies.get(SESSION_COOKIE_NAME);
    const parsed = parseSessionCookie(sessionCookie);

    if (parsed) {
      try {
        await query(
          `
            UPDATE sessions
            SET
              expires_at = LEAST(expires_at, now()),
              revoked_at = now(),
              last_seen_at = now()
            WHERE token = $1
              AND user_id = $2
          `,
          [parsed.token, parsed.userId]
        );
      } catch (error: unknown) {
        if ((error as Record<string, unknown>)?.code === '42703') {
          await query(
            `
              UPDATE sessions
              SET expires_at = LEAST(expires_at, now())
              WHERE token = $1
                AND user_id = $2
            `,
            [parsed.token, parsed.userId]
          );
        } else {
          throw error;
        }
      }
    }

    cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
    return json({ success: true });
  } catch (error: unknown) {
    if (errorContains(error, 'DATABASE_URL is not set')) {
      return json({ error: 'Server database is not configured' }, { status: 500 });
    }
    console.error('[auth/logout] unexpected error:', error);
    return json({ error: 'Failed to logout' }, { status: 500 });
  }
};

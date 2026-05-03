import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db';

/** GET /api/digest/unsubscribe?token=UUID
 *
 * Sets digest_subscriptions.subscribed = false for the matching token.
 * Redirects to /settings?tab=general&unsubscribed=1 on success.
 * Redirects to /settings?tab=general&unsubscribed=0 if token not found.
 */
export const GET: RequestHandler = async ({ url }) => {
  const token = url.searchParams.get('token') ?? '';

  if (token) {
    await query(
      `UPDATE digest_subscriptions
          SET subscribed = false
        WHERE unsubscribe_token = $1::uuid`,
      [token],
    ).catch(() => {
      // Silently ignore DB errors — we still redirect
    });
  }

  // Verify the update took effect so we can surface the right flash param
  const result = token
    ? await query<{ user_id: string }>(
        `SELECT user_id FROM digest_subscriptions WHERE unsubscribe_token = $1::uuid AND subscribed = false`,
        [token],
      ).catch(() => ({ rows: [] }))
    : { rows: [] };

  const unsubscribed = result.rows.length > 0 ? '1' : '0';
  throw redirect(302, `/settings?tab=general&unsubscribed=${unsubscribed}`);
};

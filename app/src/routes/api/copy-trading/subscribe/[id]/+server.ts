/**
 * DELETE /api/copy-trading/subscribe/[id]
 *
 * Deactivate a subscription by ID.
 * Only the follower (current user) can deactivate their own subscription.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db';
import { getAuthUserFromCookies } from '$lib/server/authGuard';

export const DELETE: RequestHandler = async ({ cookies, params }) => {
  const user = await getAuthUserFromCookies(cookies);
  if (!user) return json({ ok: false, error: 'Authentication required' }, { status: 401 });

  const result = await query(
    `UPDATE copy_subscriptions
     SET active = false
     WHERE id = $1 AND follower_id = $2
     RETURNING id`,
    [params.id, user.id],
  );

  if (result.rows.length === 0) {
    return json({ ok: false, error: 'Subscription not found' }, { status: 404 });
  }

  return json({ ok: true });
};

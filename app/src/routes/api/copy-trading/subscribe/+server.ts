/**
 * POST /api/copy-trading/subscribe
 *
 * Subscribe current user to a trader (leader).
 * Body: { leaderId: string }
 */
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db';
import { getAuthUserFromCookies } from '$lib/server/authGuard';

const SubscribeBodySchema = z.object({
  leaderId: z.string().uuid(),
});

export const POST: RequestHandler = async ({ cookies, request }) => {
  const user = await getAuthUserFromCookies(cookies);
  if (!user) return json({ ok: false, error: 'Authentication required' }, { status: 401 });

  const body = SubscribeBodySchema.parse(await request.json());

  if (user.id === body.leaderId) {
    return json({ ok: false, error: 'Cannot subscribe to yourself' }, { status: 400 });
  }

  // Check leader exists
  const leaderCheck = await query(
    'SELECT user_id FROM trader_profiles WHERE user_id = $1',
    [body.leaderId],
  );
  if (leaderCheck.rows.length === 0) {
    return json({ ok: false, error: 'Leader not found' }, { status: 404 });
  }

  // Upsert subscription (re-activate if previously deactivated)
  const result = await query<{ id: string }>(
    `INSERT INTO copy_subscriptions (follower_id, leader_id, active)
     VALUES ($1, $2, true)
     ON CONFLICT (follower_id, leader_id)
     DO UPDATE SET active = true
     RETURNING id`,
    [user.id, body.leaderId],
  );

  return json({ ok: true, subscriptionId: result.rows[0].id }, { status: 201 });
};

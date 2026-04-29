/**
 * GET /api/billing/status
 * Returns current subscription / tier status for the authenticated user.
 * Response: { tier, source, credits_remaining, expires_at }
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { query } from '$lib/server/db';

export const GET: RequestHandler = async ({ cookies }) => {
  const user = await getAuthUserFromCookies(cookies);
  if (!user) {
    return json({ tier: 'free', source: 'free', credits_remaining: 0, expires_at: null });
  }

  const rows = await query<{
    tier: string;
    subscription_active: boolean;
    subscription_expires_at: string | null;
    credits: string;
  }>(
    `SELECT
       up.tier,
       up.subscription_active,
       up.subscription_expires_at,
       COALESCE(SUM(uc.remaining), 0)::text AS credits
     FROM user_preferences up
     LEFT JOIN user_credits uc
       ON uc.user_id = up.user_id
       AND uc.remaining > 0
       AND (uc.expires_at IS NULL OR uc.expires_at > now())
     WHERE up.user_id = $1
     GROUP BY up.tier, up.subscription_active, up.subscription_expires_at`,
    [user.id],
  );

  if (!rows.rows.length) {
    return json({ tier: 'free', source: 'free', credits_remaining: 0, expires_at: null });
  }

  const row = rows.rows[0];
  const credits = parseInt(row.credits, 10) || 0;

  const isStripeActive =
    row.subscription_active &&
    row.tier === 'pro' &&
    (row.subscription_expires_at === null ||
      new Date(row.subscription_expires_at) > new Date());

  const source: 'stripe' | 'x402' | 'free' = isStripeActive
    ? 'stripe'
    : credits > 0
      ? 'x402'
      : 'free';

  const effectiveTier = isStripeActive || credits > 0 ? 'pro' : 'free';

  return json({
    tier: effectiveTier,
    source,
    credits_remaining: credits,
    expires_at: row.subscription_expires_at,
  });
};

/** POST /api/billing/status — manual sync trigger (user-triggered reconcile) */
export const POST: RequestHandler = async ({ cookies }) => {
  const user = await getAuthUserFromCookies(cookies);
  if (!user) return json({ ok: false });
  // Force a fresh DB read by returning current status (no cache to bust server-side here)
  return GET({ cookies } as Parameters<typeof GET>[0]);
};

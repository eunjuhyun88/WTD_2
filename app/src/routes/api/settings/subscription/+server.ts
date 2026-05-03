import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db';
import { getAuthUserFromCookies } from '$lib/server/authGuard';

const TIER_LIMITS: Record<string, number> = { free: 50, pro: 9999 };
const TIER_LABELS: Record<string, string> = { free: 'Free', pro: 'Pro' };

export const GET: RequestHandler = async ({ cookies }) => {
  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });

    // Fetch tier from user_preferences (set by Stripe webhook)
    const prefResult = await query<{ tier: string }>(
      `SELECT tier FROM user_preferences WHERE user_id = $1 LIMIT 1`,
      [user.id]
    );

    const tier = (prefResult.rows[0]?.tier as 'free' | 'pro') ?? 'free';
    const limit = TIER_LIMITS[tier] ?? 50;
    const label = TIER_LABELS[tier] ?? 'Free';

    // Count this month's verdicts
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const nextReset = nextMonth.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });

    const countResult = await query<{ cnt: string }>(
      `SELECT COUNT(*) AS cnt FROM ledger_verdicts WHERE user_id = $1 AND created_at >= $2`,
      [user.id, monthStart]
    );

    const verdicts_this_month = Number(countResult.rows[0]?.cnt ?? 0);

    return json({
      tier,
      tier_label: label,
      verdicts_this_month,
      verdict_limit: limit,
      next_reset: nextReset,
    });
  } catch {
    return json({ tier: 'free', tier_label: 'Free', verdicts_this_month: 0, verdict_limit: 50, next_reset: '' });
  }
};

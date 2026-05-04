/**
 * GET /api/profile/streak — current user's streak_days + next threshold (W-0403 PR11)
 *
 * Used by the dashboard StreakBadgeCard hero mount via streak.store.ts.
 * Reads the denormalized `streak` field from user_profiles (kept in sync by verdict
 * triggers). The public /passport/[username] page uses engine's authoritative
 * recompute path; this BFF avoids the extra hop for the logged-in user's own view.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { errorContains } from '$lib/utils/errorUtils';

const STREAK_TIERS = [1, 3, 7, 14, 30] as const;

export function nextStreakThreshold(streak_days: number): number | null {
  for (const t of STREAK_TIERS) {
    if (streak_days < t) return t;
  }
  return null;
}

export const GET: RequestHandler = async ({ cookies }) => {
  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });

    const res = await query<{ streak: number | null }>(
      `SELECT streak FROM user_profiles WHERE user_id = $1 LIMIT 1`,
      [user.id]
    );
    const streak_days = Number(res.rows[0]?.streak ?? 0);
    return json({
      streak_days,
      streak_next_threshold: nextStreakThreshold(streak_days),
    });
  } catch (error: unknown) {
    if (errorContains(error, 'DATABASE_URL is not set')) {
      return json({ error: 'Server database is not configured' }, { status: 500 });
    }
    console.error('[profile/streak] unexpected error:', error);
    return json({ error: 'Internal error' }, { status: 500 });
  }
};

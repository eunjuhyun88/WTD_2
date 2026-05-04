import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { query } from '$lib/server/db';

export const load: PageServerLoad = async ({ cookies }) => {
  // Auth gate
  const user = await getAuthUserFromCookies(cookies);
  if (!user) redirect(302, '/');

  // Beta gate (BETA_OPEN env bypasses)
  let betaInvited = process.env.BETA_OPEN === 'true';
  if (!betaInvited) {
    const sub = await query<{ beta_invited: boolean }>(
      `SELECT beta_invited FROM subscriptions WHERE user_id = $1 LIMIT 1`,
      [user.id],
    );
    betaInvited = sub.rows[0]?.beta_invited ?? false;
  }

  if (!betaInvited) {
    return { betaInvited: false, evaluation: null };
  }

  // Fetch evaluation
  const evalRes = await query<{
    id: string;
    status: string;
    trading_days: number;
    equity_start: number;
    equity_current: number;
    started_at: string | null;
  }>(
    `SELECT id, status, trading_days, equity_start, equity_current, started_at
     FROM evaluations
     WHERE user_id = $1
     ORDER BY CASE WHEN status = 'ACTIVE' THEN 0 ELSE 1 END, created_at DESC
     LIMIT 1`,
    [user.id],
  );

  const evaluation = evalRes.rows[0] ?? null;

  // Redirect shortcuts
  if (evaluation?.status === 'ACTIVE') redirect(302, '/propfirm/dashboard');
  if (evaluation?.status === 'PASSED') redirect(302, `/propfirm/verify/${evaluation.id}`);

  return { betaInvited: true, evaluation };
};

import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { query } from '$lib/server/db';

export const load: PageServerLoad = async ({ cookies }) => {
  const user = await getAuthUserFromCookies(cookies);
  if (!user) redirect(302, '/');

  const evalRes = await query<{
    id: string;
    status: string;
    trading_days: number;
    equity_start: number;
    equity_current: number;
    started_at: string | null;
    tier_id: string;
  }>(
    `SELECT id, status, trading_days, equity_start, equity_current, started_at, tier_id
     FROM evaluations
     WHERE user_id = $1 AND status = 'ACTIVE'
     LIMIT 1`,
    [user.id],
  );

  if (!evalRes.rows.length) redirect(302, '/propfirm');
  const evaluation = evalRes.rows[0];

  const tierRes = await query<{
    name: string;
    mll_pct: number;
    profit_goal_pct: number;
    min_trading_days: number;
  }>(
    `SELECT name, mll_pct, profit_goal_pct, min_trading_days
     FROM challenge_tiers WHERE id = $1`,
    [evaluation.tier_id],
  );
  const tier = tierRes.rows[0] ?? {
    name: 'Standard',
    mll_pct: 0.05,
    profit_goal_pct: 0.08,
    min_trading_days: 10,
  };

  const violationsRes = await query<{ rule: string; violated_at: string }>(
    `SELECT rule, violated_at FROM rule_violations
     WHERE evaluation_id = $1 ORDER BY violated_at DESC LIMIT 5`,
    [evaluation.id],
  );

  return {
    evaluation,
    tier,
    violations: violationsRes.rows,
    user: { nickname: user.nickname },
  };
};

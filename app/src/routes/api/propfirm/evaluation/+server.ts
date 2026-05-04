/**
 * GET /api/propfirm/evaluation
 * Returns current user's evaluation + tier config + violations.
 * 401 if not authenticated, 204 if no evaluation found.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { query } from '$lib/server/db';

export const GET: RequestHandler = async ({ cookies }) => {
  const user = await getAuthUserFromCookies(cookies);
  if (!user) return new Response(null, { status: 401 });

  // Fetch most recent evaluation (ACTIVE first, then latest by created_at)
  const evalRes = await query<{
    id: string;
    status: string;
    trading_days: number;
    equity_start: number;
    equity_current: number;
    started_at: string | null;
    ended_at: string | null;
    tier_id: string;
  }>(
    `SELECT id, status, trading_days, equity_start, equity_current,
            started_at, ended_at, tier_id
     FROM evaluations
     WHERE user_id = $1
     ORDER BY CASE WHEN status = 'ACTIVE' THEN 0 ELSE 1 END, created_at DESC
     LIMIT 1`,
    [user.id],
  );

  if (!evalRes.rows.length) return new Response(null, { status: 204 });
  const evaluation = evalRes.rows[0];

  // Tier config
  const tierRes = await query<{
    name: string;
    fee_usd: number;
    mll_pct: number;
    profit_goal_pct: number;
    min_trading_days: number;
  }>(
    `SELECT name, fee_usd, mll_pct, profit_goal_pct, min_trading_days
     FROM challenge_tiers WHERE id = $1`,
    [evaluation.tier_id],
  );
  const tier = tierRes.rows[0] ?? null;

  // Recent violations
  const vRes = await query<{ rule: string; detail: unknown; violated_at: string }>(
    `SELECT rule, detail, violated_at FROM rule_violations
     WHERE evaluation_id = $1 ORDER BY violated_at DESC LIMIT 10`,
    [evaluation.id],
  );

  return json({ evaluation, tier, violations: vRes.rows });
};

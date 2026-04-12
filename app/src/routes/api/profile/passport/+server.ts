import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { errorContains } from '$lib/utils/errorUtils';

export const GET: RequestHandler = async ({ cookies }) => {
  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });

    const [profile, openTrades, tracked, matchSummary, agentSummary] = await Promise.all([
      query(
        `SELECT display_tier, total_matches, wins, losses, streak, best_streak, total_lp, total_pnl, badges FROM user_profiles WHERE user_id = $1 LIMIT 1`,
        [user.id]
      ),
      query<{ count: string }>(`SELECT count(*)::text AS count FROM quick_trades WHERE user_id = $1 AND status = 'open'`, [user.id]),
      query<{ count: string }>(`SELECT count(*)::text AS count FROM tracked_signals WHERE user_id = $1 AND status = 'tracking'`, [user.id]),
      query<{ count: string; wins: string }>(
        `SELECT count(*)::text AS count, COALESCE(sum(CASE WHEN win THEN 1 ELSE 0 END), 0)::text AS wins FROM matches WHERE user_id = $1`,
        [user.id]
      ),
      query<{ total_agents: string; avg_level: string }>(
        `SELECT count(*)::text AS total_agents, COALESCE(avg(level), 0)::text AS avg_level FROM agent_stats WHERE user_id = $1`,
        [user.id]
      ),
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p: Record<string, any> = profile.rows[0] || {};
    const totalMatches = Number(matchSummary.rows[0]?.count ?? p.total_matches ?? 0);
    const totalWins = Number(matchSummary.rows[0]?.wins ?? p.wins ?? 0);
    const winRate = totalMatches > 0 ? (totalWins / totalMatches) * 100 : 0;

    return json({
      success: true,
      passport: {
        tier: p.display_tier || 'bronze',
        totalMatches,
        wins: Number(p.wins ?? totalWins),
        losses: Number(p.losses ?? Math.max(0, totalMatches - totalWins)),
        streak: Number(p.streak ?? 0),
        bestStreak: Number(p.best_streak ?? 0),
        totalLp: Number(p.total_lp ?? 0),
        totalPnl: Number(p.total_pnl ?? 0),
        badges: p.badges ?? [],
        openTrades: Number(openTrades.rows[0]?.count ?? '0'),
        trackedSignals: Number(tracked.rows[0]?.count ?? '0'),
        winRate: Number(winRate.toFixed(2)),
        agentSummary: {
          totalAgents: Number(agentSummary.rows[0]?.total_agents ?? '0'),
          avgLevel: Number(agentSummary.rows[0]?.avg_level ?? '0'),
        },
      },
    });
  } catch (error: unknown) {
    if (errorContains(error, 'DATABASE_URL is not set')) {
      return json({ error: 'Server database is not configured' }, { status: 500 });
    }
    console.error('[profile/passport] unexpected error:', error);
    return json({ error: 'Failed to load passport' }, { status: 500 });
  }
};

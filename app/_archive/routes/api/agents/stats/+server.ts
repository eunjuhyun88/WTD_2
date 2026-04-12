import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { errorContains } from '$lib/utils/errorUtils';

export const GET: RequestHandler = async ({ cookies }) => {
  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });

    const rows = await query(
      `
        SELECT
          id, user_id, agent_id, level, xp, xp_max,
          wins, losses, best_streak, cur_streak,
          avg_conf, best_conf, stamps, updated_at
        FROM agent_stats
        WHERE user_id = $1
        ORDER BY level DESC, wins DESC, updated_at DESC
      `,
      [user.id]
    );

    return json({
      success: true,
      records: rows.rows.map((r: any) => ({
        id: r.id,
        userId: r.user_id,
        agentId: r.agent_id,
        level: Number(r.level ?? 1),
        xp: Number(r.xp ?? 0),
        xpMax: Number(r.xp_max ?? 100),
        wins: Number(r.wins ?? 0),
        losses: Number(r.losses ?? 0),
        bestStreak: Number(r.best_streak ?? 0),
        curStreak: Number(r.cur_streak ?? 0),
        avgConf: Number(r.avg_conf ?? 0),
        bestConf: Number(r.best_conf ?? 0),
        stamps: r.stamps ?? {},
        updatedAt: new Date(r.updated_at).getTime(),
      })),
    });
  } catch (error: unknown) {
    if (errorContains(error, 'DATABASE_URL is not set')) {
      return json({ error: 'Server database is not configured' }, { status: 500 });
    }
    console.error('[agents/stats/get] unexpected error:', error);
    return json({ error: 'Failed to load agent stats' }, { status: 500 });
  }
};

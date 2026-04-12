import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { toBoundedInt, toNumber } from '$lib/server/apiValidation';
import { errorContains } from '$lib/utils/errorUtils';

export const PATCH: RequestHandler = async ({ cookies, request, params }) => {
  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });

    const agentId = typeof params.agentId === 'string' ? params.agentId.trim() : '';
    if (!agentId) return json({ error: 'agentId is required' }, { status: 400 });

    const body = await request.json();

    const level = toBoundedInt(body?.level, 1, 1, 99);
    const xp = toBoundedInt(body?.xp, 0, 0, 1_000_000);
    const xpMax = toBoundedInt(body?.xpMax, 100, 1, 1_000_000);
    const wins = toBoundedInt(body?.wins, 0, 0, 1_000_000);
    const losses = toBoundedInt(body?.losses, 0, 0, 1_000_000);
    const bestStreak = toBoundedInt(body?.bestStreak, 0, 0, 1_000_000);
    const curStreak = toBoundedInt(body?.curStreak, 0, 0, 1_000_000);
    const avgConf = toNumber(body?.avgConf, 0);
    const bestConf = toNumber(body?.bestConf, 0);
    const stamps = body?.stamps && typeof body.stamps === 'object' ? body.stamps : {};

    const result = await query(
      `
        INSERT INTO agent_stats (
          user_id, agent_id, level, xp, xp_max,
          wins, losses, best_streak, cur_streak,
          avg_conf, best_conf, stamps, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, now())
        ON CONFLICT (user_id, agent_id)
        DO UPDATE SET
          level = EXCLUDED.level,
          xp = EXCLUDED.xp,
          xp_max = EXCLUDED.xp_max,
          wins = EXCLUDED.wins,
          losses = EXCLUDED.losses,
          best_streak = EXCLUDED.best_streak,
          cur_streak = EXCLUDED.cur_streak,
          avg_conf = EXCLUDED.avg_conf,
          best_conf = EXCLUDED.best_conf,
          stamps = EXCLUDED.stamps,
          updated_at = now()
        RETURNING
          id, user_id, agent_id, level, xp, xp_max,
          wins, losses, best_streak, cur_streak,
          avg_conf, best_conf, stamps, updated_at
      `,
      [
        user.id,
        agentId,
        level,
        xp,
        xpMax,
        wins,
        losses,
        bestStreak,
        curStreak,
        avgConf,
        bestConf,
        JSON.stringify(stamps),
      ]
    );

    const r: Record<string, unknown> = result.rows[0];
    return json({
      success: true,
      stat: {
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
        updatedAt: new Date(r.updated_at as string).getTime(),
      },
    });
  } catch (error: unknown) {
    if (errorContains(error, 'DATABASE_URL is not set')) {
      return json({ error: 'Server database is not configured' }, { status: 500 });
    }
    if (error instanceof SyntaxError) return json({ error: 'Invalid request body' }, { status: 400 });
    console.error('[agents/stats/patch] unexpected error:', error);
    return json({ error: 'Failed to update agent stats' }, { status: 500 });
  }
};

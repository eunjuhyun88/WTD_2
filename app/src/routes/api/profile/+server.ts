import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db';
import { getAuthUserFromCookies } from '$lib/server/authGuard';

export const GET: RequestHandler = async ({ cookies }) => {
  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });

    const [userRow, profileRow] = await Promise.all([
      query(
        `SELECT id, email, nickname, wallet_address, tier, phase, avatar, created_at, updated_at
         FROM users WHERE id = $1 LIMIT 1`,
        [user.id]
      ),
      query(
        `SELECT user_id, display_tier, total_matches, wins, losses,
                streak, best_streak, total_lp, total_pnl, badges, updated_at
         FROM user_profiles WHERE user_id = $1 LIMIT 1`,
        [user.id]
      ),
    ]);

    const u: any = userRow.rows[0] || {};
    const p: any = profileRow.rows[0] || {};

    return json({
      success: true,
      profile: {
        id: u.id,
        email: u.email,
        nickname: u.nickname,
        walletAddress: u.wallet_address,
        tier: u.tier,
        phase: Number(u.phase ?? 0),
        avatar: u.avatar || null,
        createdAt: u.created_at ? new Date(u.created_at).getTime() : null,
        updatedAt: u.updated_at ? new Date(u.updated_at).getTime() : null,
        stats: {
          displayTier: p.display_tier || 'bronze',
          totalMatches: Number(p.total_matches ?? 0),
          wins: Number(p.wins ?? 0),
          losses: Number(p.losses ?? 0),
          streak: Number(p.streak ?? 0),
          bestStreak: Number(p.best_streak ?? 0),
          totalLp: Number(p.total_lp ?? 0),
          totalPnl: Number(p.total_pnl ?? 0),
          badges: p.badges ?? [],
          updatedAt: p.updated_at ? new Date(p.updated_at).getTime() : null,
        },
      },
    });
  } catch (error: any) {
    if (typeof error?.message === 'string' && error.message.includes('DATABASE_URL is not set')) {
      return json({ error: 'Server database is not configured' }, { status: 500 });
    }
    console.error('[profile/get] unexpected error:', error);
    return json({ error: 'Failed to load profile' }, { status: 500 });
  }
};

export const PATCH: RequestHandler = async ({ cookies, request }) => {
  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });

    const body = await request.json();
    const nickname = typeof body?.nickname === 'string' ? body.nickname.trim() : null;
    const avatar = typeof body?.avatar === 'string' ? body.avatar.trim() : null;
    const displayTier = typeof body?.displayTier === 'string' ? body.displayTier.trim().toLowerCase() : null;
    const badges = Array.isArray(body?.badges) ? body.badges : null;

    if (nickname && nickname.length < 2) {
      return json({ error: 'nickname must be at least 2 characters' }, { status: 400 });
    }

    const allowedTier = ['bronze', 'silver', 'gold', 'diamond', 'master'];
    if (displayTier && !allowedTier.includes(displayTier)) {
      return json({ error: 'displayTier must be bronze|silver|gold|diamond|master' }, { status: 400 });
    }

    if (nickname || avatar) {
      await query(
        `
          UPDATE users
          SET
            nickname = COALESCE($1, nickname),
            avatar = COALESCE($2, avatar),
            updated_at = now()
          WHERE id = $3
        `,
        [nickname, avatar, user.id]
      );
    }

    if (displayTier || badges) {
      const setClauses: string[] = ['updated_at = now()'];
      const params: any[] = [];
      let paramIdx = 1;

      if (displayTier) {
        setClauses.push(`display_tier = $${paramIdx++}`);
        params.push(displayTier);
      }
      if (badges) {
        setClauses.push(`badges = $${paramIdx++}::jsonb`);
        params.push(JSON.stringify(badges));
      }
      params.push(user.id);

      await query(
        `UPDATE user_profiles SET ${setClauses.join(', ')} WHERE user_id = $${paramIdx}`,
        params
      );
    }

    return json({ success: true });
  } catch (error: any) {
    if (error?.code === '23505') {
      return json({ error: 'Nickname is already taken' }, { status: 409 });
    }
    if (typeof error?.message === 'string' && error.message.includes('DATABASE_URL is not set')) {
      return json({ error: 'Server database is not configured' }, { status: 500 });
    }
    if (error instanceof SyntaxError) return json({ error: 'Invalid request body' }, { status: 400 });
    console.error('[profile/patch] unexpected error:', error);
    return json({ error: 'Failed to update profile' }, { status: 500 });
  }
};

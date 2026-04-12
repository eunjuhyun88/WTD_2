// ═══════════════════════════════════════════════════════════════
// Stockclaw — Progression API (S-02)
// GET:  현재 유저의 통합 프로그레션 상태 조회
// POST: 매치 결과 → LP 업데이트 + tier 갱신 + lp_transactions 기록
// ═══════════════════════════════════════════════════════════════

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { resolveProgression, getTier, tierToDisplay } from '$lib/stores/progressionRules';
import { LP_REWARDS, LOSS_STREAK_MERCY_THRESHOLD, LOSS_STREAK_MERCY_LP, CLUTCH_FBS_THRESHOLD } from '$lib/engine/constants';
import type { LPReason } from '$lib/engine/types';

// ─── GET: 통합 프로그레션 상태 ─────────────────────────────────
export const GET: RequestHandler = async ({ cookies }) => {
  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });

    const result = await query<{
      total_lp: number;
      total_matches: number;
      wins: number;
      losses: number;
      streak: number;
      agent_match_counts: Record<string, number>;
    }>(
      `SELECT total_lp, total_matches, wins, losses, streak,
              COALESCE(agent_match_counts, '{}') as agent_match_counts
       FROM user_profiles WHERE user_id = $1 LIMIT 1`,
      [user.id]
    );

    if (result.rows.length === 0) {
      // 프로필 없는 유저 → 기본값 반환
      const defaultState = resolveProgression({
        lp: 0, totalMatches: 0, wins: 0, losses: 0, streak: 0,
      });
      return json({ success: true, progression: defaultState });
    }

    const p = result.rows[0];
    const progression = resolveProgression({
      lp: Number(p.total_lp) || 0,
      totalMatches: Number(p.total_matches) || 0,
      wins: Number(p.wins) || 0,
      losses: Number(p.losses) || 0,
      streak: Number(p.streak) || 0,
      agentMatchCounts: typeof p.agent_match_counts === 'object' ? p.agent_match_counts : {},
    });

    return json({ success: true, progression });
  } catch (err: any) {
    console.error('[progression/GET]', err);
    return json({ error: 'Failed to fetch progression' }, { status: 500 });
  }
};

// ─── POST: LP 업데이트 (매치 결과) ────────────────────────────
export const POST: RequestHandler = async ({ request, cookies }) => {
  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });

    const body = await request.json();
    const matchId: string | null = typeof body?.matchId === 'string' ? body.matchId : null;
    const reason: string = typeof body?.reason === 'string' ? body.reason : '';
    const won: boolean = body?.won === true;
    const fbs: number = typeof body?.fbs === 'number' ? body.fbs : 0;
    const agentIds: string[] = Array.isArray(body?.agentIds) ? body.agentIds : [];

    // LP 이유 검증
    const validReasons: LPReason[] = [
      'normal_win', 'clutch_win', 'loss', 'draw',
      'perfect_read', 'dissent_win',
      'challenge_win', 'challenge_loss', 'streak_bonus',
    ];

    // LP 계산
    let lpReason: LPReason;
    if (reason && validReasons.includes(reason as LPReason)) {
      lpReason = reason as LPReason;
    } else if (won) {
      lpReason = fbs >= CLUTCH_FBS_THRESHOLD ? 'clutch_win' : 'normal_win';
    } else {
      lpReason = 'loss';
    }

    // 현재 프로필 조회
    const profileResult = await query<{
      total_lp: number;
      total_matches: number;
      wins: number;
      losses: number;
      streak: number;
      agent_match_counts: Record<string, number>;
    }>(
      `SELECT total_lp, total_matches, wins, losses, streak,
              COALESCE(agent_match_counts, '{}') as agent_match_counts
       FROM user_profiles WHERE user_id = $1 LIMIT 1`,
      [user.id]
    );

    const current = profileResult.rows[0] ?? {
      total_lp: 0, total_matches: 0, wins: 0, losses: 0, streak: 0,
      agent_match_counts: {},
    };

    const lpBefore = Number(current.total_lp) || 0;
    const curStreak = Number(current.streak) || 0;

    // LP 보상 계산 (연패 완화 적용)
    let delta = LP_REWARDS[lpReason] ?? 0;
    if (lpReason === 'loss' && Math.abs(curStreak) >= LOSS_STREAK_MERCY_THRESHOLD) {
      delta = LOSS_STREAK_MERCY_LP; // -8 → -5
    }

    const lpAfter = Math.max(0, lpBefore + delta);
    const tierBefore = getTier(lpBefore);
    const tierAfter = getTier(lpAfter);

    // 스트릭 업데이트
    const newStreak = won ? Math.max(curStreak + 1, 1) : Math.min(curStreak - 1, -1);

    // 에이전트 매치 카운트 업데이트
    const agentCounts = typeof current.agent_match_counts === 'object'
      ? { ...current.agent_match_counts }
      : {};
    for (const aid of agentIds) {
      agentCounts[aid] = (agentCounts[aid] || 0) + 1;
    }

    // DB 업데이트 (프로필 + LP 트랜잭션)
    await query(
      `UPDATE user_profiles SET
        total_lp = $2,
        total_matches = total_matches + 1,
        wins = wins + $3,
        losses = losses + $4,
        streak = $5,
        display_tier = $6,
        agent_match_counts = $7,
        updated_at = now()
       WHERE user_id = $1`,
      [
        user.id,
        lpAfter,
        won ? 1 : 0,
        won ? 0 : 1,
        newStreak,
        tierToDisplay(tierAfter.tier),
        JSON.stringify(agentCounts),
      ]
    );

    // LP 트랜잭션 로그
    try {
      await query(
        `INSERT INTO lp_transactions (user_id, match_id, reason, delta, lp_before, lp_after, tier_before, tier_after, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          user.id,
          matchId,
          lpReason,
          delta,
          lpBefore,
          lpAfter,
          tierToDisplay(tierBefore.tier),
          tierToDisplay(tierAfter.tier),
          JSON.stringify({ fbs, agentIds, streak: newStreak }),
        ]
      );
    } catch (logErr) {
      // lp_transactions 테이블 없어도 핵심 로직 방해하지 않음
      console.warn('[progression/POST] LP transaction log failed:', logErr);
    }

    // 응답
    const progression = resolveProgression({
      lp: lpAfter,
      totalMatches: (Number(current.total_matches) || 0) + 1,
      wins: (Number(current.wins) || 0) + (won ? 1 : 0),
      losses: (Number(current.losses) || 0) + (won ? 0 : 1),
      streak: newStreak,
      agentMatchCounts: agentCounts,
    });

    const tierChanged = tierBefore.tier !== tierAfter.tier;

    return json({
      success: true,
      lpDelta: delta,
      lpReason,
      lpBefore,
      lpAfter,
      tierChanged,
      progression,
    });
  } catch (err: any) {
    console.error('[progression/POST]', err);
    return json({ error: 'Failed to update progression' }, { status: 500 });
  }
};

// ═══════════════════════════════════════════════════════════════
// Stockclaw — Progression Updater (server-side)
// arena/resolve에서 호출. LP 계산 + DB 반영 + lp_transactions 기록.
// /api/progression POST와 동일 로직이나 내부 호출용 (HTTP 오버헤드 없음).
// ═══════════════════════════════════════════════════════════════

import { query } from '$lib/server/db';
import { getTier, tierToDisplay, resolveProgression } from '$lib/stores/progressionRules';
import type { ProgressionState } from '$lib/stores/progressionRules';
import {
  LP_REWARDS,
  LOSS_STREAK_MERCY_THRESHOLD,
  LOSS_STREAK_MERCY_LP,
  CLUTCH_FBS_THRESHOLD,
} from '$lib/engine/constants';
import type { LPReason, MatchResultType } from '$lib/engine/types';

export interface MatchProgressionInput {
  matchId: string;
  won: boolean;
  resultType: MatchResultType;
  fbs: number;
  agentIds: string[];
}

export interface MatchProgressionResult {
  lpDelta: number;
  lpReason: LPReason;
  lpBefore: number;
  lpAfter: number;
  tierChanged: boolean;
  progression: ProgressionState;
}

export async function updateProgressionAfterMatch(
  userId: string,
  input: MatchProgressionInput,
): Promise<MatchProgressionResult> {
  // LP 이유 결정
  let lpReason: LPReason;
  if (input.won) {
    lpReason = input.fbs >= CLUTCH_FBS_THRESHOLD ? 'clutch_win' : 'normal_win';
  } else if (input.resultType === 'draw') {
    lpReason = 'draw';
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
    [userId]
  );

  const current = profileResult.rows[0] ?? {
    total_lp: 0, total_matches: 0, wins: 0, losses: 0, streak: 0,
    agent_match_counts: {},
  };

  const lpBefore = Number(current.total_lp) || 0;
  const curStreak = Number(current.streak) || 0;

  // LP delta 계산 (연패 완화 적용)
  let delta = LP_REWARDS[lpReason] ?? 0;
  if (lpReason === 'loss' && Math.abs(curStreak) >= LOSS_STREAK_MERCY_THRESHOLD) {
    delta = LOSS_STREAK_MERCY_LP;
  }

  const lpAfter = Math.max(0, lpBefore + delta);
  const tierBefore = getTier(lpBefore);
  const tierAfter = getTier(lpAfter);
  const newStreak = input.won ? Math.max(curStreak + 1, 1) : Math.min(curStreak - 1, -1);

  // 에이전트 매치 카운트
  const agentCounts = typeof current.agent_match_counts === 'object'
    ? { ...current.agent_match_counts }
    : {};
  for (const aid of input.agentIds) {
    agentCounts[aid] = (agentCounts[aid] || 0) + 1;
  }

  // DB 업데이트
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
      userId,
      lpAfter,
      input.won ? 1 : 0,
      input.won ? 0 : 1,
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
        userId,
        input.matchId,
        lpReason,
        delta,
        lpBefore,
        lpAfter,
        tierToDisplay(tierBefore.tier),
        tierToDisplay(tierAfter.tier),
        JSON.stringify({ fbs: input.fbs, agentIds: input.agentIds, streak: newStreak }),
      ]
    );
  } catch (logErr) {
    console.warn('[progressionUpdater] LP transaction log failed:', logErr);
  }

  const progression = resolveProgression({
    lp: lpAfter,
    totalMatches: (Number(current.total_matches) || 0) + 1,
    wins: (Number(current.wins) || 0) + (input.won ? 1 : 0),
    losses: (Number(current.losses) || 0) + (input.won ? 0 : 1),
    streak: newStreak,
    agentMatchCounts: agentCounts,
  });

  return {
    lpDelta: delta,
    lpReason,
    lpBefore,
    lpAfter,
    tierChanged: tierBefore.tier !== tierAfter.tier,
    progression,
  };
}

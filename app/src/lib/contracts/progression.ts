export type Tier = 'BRONZE' | 'SILVER' | 'GOLD' | 'DIAMOND' | 'MASTER';

export interface TierInfo {
  tier: Tier;
  level: number;
  lpMin: number;
  lpMax: number;
  features: string[];
}

export type LPReason =
  | 'normal_win' | 'clutch_win' | 'loss' | 'draw'
  | 'perfect_read' | 'dissent_win'
  | 'challenge_win' | 'challenge_loss'
  | 'streak_bonus';

export const SPEC_UNLOCK_A = 10;
export const SPEC_UNLOCK_B = 10;
export const SPEC_UNLOCK_C = 30;

export const CLUTCH_FBS_THRESHOLD = 80;

export const LP_REWARDS: Record<LPReason, number> = {
  normal_win: 11,
  clutch_win: 18,
  loss: -8,
  draw: 2,
  perfect_read: 3,
  dissent_win: 5,
  challenge_win: 7,
  challenge_loss: -4,
  streak_bonus: 0,
};

export const LOSS_STREAK_MERCY_THRESHOLD = 7;
export const LOSS_STREAK_MERCY_LP = -5;

export const TIER_TABLE: TierInfo[] = [
  {
    tier: 'BRONZE',
    level: 1,
    lpMin: 0,
    lpMax: 199,
    features: ['8 에이전트 풀 (Base Spec)', 'Loop B', '기본 매치'],
  },
  {
    tier: 'SILVER',
    level: 1,
    lpMin: 200,
    lpMax: 599,
    features: ['멀티 포지션', 'Loop D (일배치)', '에이전트 통계'],
  },
  {
    tier: 'GOLD',
    level: 1,
    lpMin: 600,
    lpMax: 1199,
    features: ['Oracle 열람', 'Challenge 가능', 'Spec C 해금 가능'],
  },
  {
    tier: 'DIAMOND',
    level: 1,
    lpMin: 1200,
    lpMax: 1599,
    features: ['LIVE 관전', 'Season 랭킹', '팀 매치'],
  },
  {
    tier: 'DIAMOND',
    level: 2,
    lpMin: 1600,
    lpMax: 1999,
    features: ['Creator 프로필'],
  },
  {
    tier: 'DIAMOND',
    level: 3,
    lpMin: 2000,
    lpMax: 2199,
    features: ['Coach Review'],
  },
  {
    tier: 'MASTER',
    level: 1,
    lpMin: 2200,
    lpMax: Infinity,
    features: ['Strategy NFT', 'RAG 기억 리뷰', '전체 해금'],
  },
];

export function getTierForLP(lp: number): { tier: Tier; level: number } {
  if (lp >= 2200) return { tier: 'MASTER', level: 1 };
  if (lp >= 2000) return { tier: 'DIAMOND', level: 3 };
  if (lp >= 1600) return { tier: 'DIAMOND', level: 2 };
  if (lp >= 1200) return { tier: 'DIAMOND', level: 1 };
  if (lp >= 600) return { tier: 'GOLD', level: 1 };
  if (lp >= 200) return { tier: 'SILVER', level: 1 };
  return { tier: 'BRONZE', level: 1 };
}

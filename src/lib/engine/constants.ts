// ═══════════════════════════════════════════════════════════════
// STOCKCLAW — Agent Engine v3 Constants
// ═══════════════════════════════════════════════════════════════

import type { Tier, TierInfo, LPReason } from './types';

// ─── Match Timers ────────────────────────────────────────────

export const DRAFT_DURATION_SEC = 60;
export const HYPOTHESIS_DURATION_SEC = 30;
export const BATTLE_DURATION_SEC = 60;
export const DECISION_WINDOW_SEC = 10;
export const DECISION_WINDOW_COUNT = 6;
export const VS_SCREEN_SEC = 2;
export const ANALYSIS_TIMEOUT_MS = 15_000;  // LLM 포함 최대 15초

// ─── Draft Rules ─────────────────────────────────────────────

export const DRAFT_AGENT_COUNT = 3;
export const DRAFT_TOTAL_WEIGHT = 100;
export const DRAFT_MIN_WEIGHT = 10;
export const DRAFT_MAX_WEIGHT = 80;

// ─── Draft Validation (S-04) ────────────────────────────────

import type { DraftSelection, DraftValidationResult, AgentId } from './types';
import { AGENT_IDS } from './types';

export function validateDraft(selections: DraftSelection[]): DraftValidationResult {
  const errors: string[] = [];

  // 1. 에이전트 수 정확히 3개
  if (selections.length !== DRAFT_AGENT_COUNT) {
    errors.push(`에이전트 ${DRAFT_AGENT_COUNT}개 필요 (현재 ${selections.length}개)`);
  }

  // 2. 중복 에이전트 없음 (대소문자 정규화)
  const ids = selections.map(s => s.agentId.toUpperCase());
  const unique = new Set(ids);
  if (unique.size !== ids.length) {
    errors.push('중복 에이전트 선택 불가');
  }

  // 3. 유효한 에이전트 ID (대소문자 무관)
  for (const s of selections) {
    if (!AGENT_IDS.includes(s.agentId.toUpperCase() as AgentId)) {
      errors.push(`유효하지 않은 에이전트: ${s.agentId}`);
    }
  }

  // 4. weight 합계 = 100
  const totalWeight = selections.reduce((sum, s) => sum + s.weight, 0);
  if (totalWeight !== DRAFT_TOTAL_WEIGHT) {
    errors.push(`가중치 합계 ${DRAFT_TOTAL_WEIGHT} 필요 (현재 ${totalWeight})`);
  }

  // 5. 개별 weight 범위
  for (const s of selections) {
    if (s.weight < DRAFT_MIN_WEIGHT || s.weight > DRAFT_MAX_WEIGHT) {
      errors.push(`${s.agentId} 가중치 ${DRAFT_MIN_WEIGHT}-${DRAFT_MAX_WEIGHT} 범위 벗어남 (${s.weight})`);
    }
  }

  // 6. specId 존재 확인 (빈 문자열 방지)
  for (const s of selections) {
    if (!s.specId || s.specId.trim() === '') {
      errors.push(`${s.agentId} spec 미선택`);
    }
  }

  return { valid: errors.length === 0, errors };
}

// ─── Spec Unlock ─────────────────────────────────────────────

export const SPEC_UNLOCK_A = 10;   // A + B 동시 해금
export const SPEC_UNLOCK_B = 10;
export const SPEC_UNLOCK_C = 30;

// ─── Scoring ─────────────────────────────────────────────────

export const FBS_WEIGHT_DS = 0.5;
export const FBS_WEIGHT_RE = 0.3;
export const FBS_WEIGHT_CI = 0.2;

export const CLUTCH_FBS_THRESHOLD = 80;  // FBS 80+ → clutch_win

// ─── LP Rewards ──────────────────────────────────────────────

export const LP_REWARDS: Record<LPReason, number> = {
  normal_win:     11,
  clutch_win:     18,
  loss:          -8,
  draw:           2,
  perfect_read:   3,   // 보너스 (에이전트 3/3 정확)
  dissent_win:    5,   // 보너스 (에이전트 반대, 유저 맞음)
  challenge_win:  7,
  challenge_loss: -4,
  streak_bonus:   0,   // 동적 계산
};

// 연패 완화: 7연패 이후 -8 → -5
export const LOSS_STREAK_MERCY_THRESHOLD = 7;
export const LOSS_STREAK_MERCY_LP = -5;

// ─── Tier Definitions ────────────────────────────────────────

export const TIER_TABLE: TierInfo[] = [
  {
    tier: 'BRONZE',  level: 1,
    lpMin: 0, lpMax: 199,
    features: ['8 에이전트 풀 (Base Spec)', 'Loop B', '기본 매치'],
  },
  {
    tier: 'SILVER',  level: 1,
    lpMin: 200, lpMax: 599,
    features: ['멀티 포지션', 'Loop D (일배치)', '에이전트 통계'],
  },
  {
    tier: 'GOLD',    level: 1,
    lpMin: 600, lpMax: 1199,
    features: ['Oracle 열람', 'Challenge 가능', 'Spec C 해금 가능'],
  },
  {
    tier: 'DIAMOND', level: 1,
    lpMin: 1200, lpMax: 1599,
    features: ['LIVE 관전', 'Season 랭킹', '팀 매치'],
  },
  {
    tier: 'DIAMOND', level: 2,
    lpMin: 1600, lpMax: 1999,
    features: ['Creator 프로필'],
  },
  {
    tier: 'DIAMOND', level: 3,
    lpMin: 2000, lpMax: 2199,
    features: ['Coach Review'],
  },
  {
    tier: 'MASTER',  level: 1,
    lpMin: 2200, lpMax: Infinity,
    features: ['Strategy NFT', 'RAG 기억 리뷰', '전체 해금'],
  },
];

export function getTierForLP(lp: number): { tier: Tier; level: number } {
  if (lp >= 2200) return { tier: 'MASTER',  level: 1 };
  if (lp >= 2000) return { tier: 'DIAMOND', level: 3 };
  if (lp >= 1600) return { tier: 'DIAMOND', level: 2 };
  if (lp >= 1200) return { tier: 'DIAMOND', level: 1 };
  if (lp >= 600)  return { tier: 'GOLD',    level: 1 };
  if (lp >= 200)  return { tier: 'SILVER',  level: 1 };
  return { tier: 'BRONZE', level: 1 };
}

// ─── Passport Metrics ────────────────────────────────────────

export const PASSPORT_MIN_SAMPLES = {
  winRate: 10,
  directionAccuracy: 10,
  ids: 5,           // DISSENT 5판
  calibration: 10,
  guardian: 3,       // Override 3회
  challenge: 3,      // Challenge 3회
};

// ─── Badges ──────────────────────────────────────────────────

export const BADGE_DEFINITIONS = [
  { id: 'season_top10',    name: 'SEASON TOP10',    icon: '🏆', category: 'season' as const },
  { id: 'perfect_read',    name: 'PERFECT READ',    icon: '🎯', category: 'skill' as const },
  { id: 'dissent_win',     name: 'DISSENT WIN',     icon: '⚡', category: 'courage' as const },
  { id: 'night_owl',       name: 'NIGHT OWL',       icon: '🌙', category: 'activity' as const },
  { id: 'whale_hunter',    name: 'WHALE HUNTER',    icon: '🐋', category: 'mastery' as const },
  { id: 'oracle_master',   name: 'ORACLE MASTER',   icon: '🔮', category: 'mastery' as const },
  { id: 'diamond_hands',   name: 'DIAMOND HANDS',   icon: '💎', category: 'consistency' as const },
  { id: 'master_league',   name: 'MASTER LEAGUE',   icon: '🔒', category: 'progression' as const },
  { id: 'agent_killer',    name: 'AGENT KILLER',    icon: '⚔️', category: 'courage' as const },
  { id: '100_matches',     name: '100판 달성',      icon: '💯', category: 'progression' as const },
];

// ─── RAG Memory ──────────────────────────────────────────────

export const RAG_MEMORY_TOP_K = 5;
export const RAG_EMBEDDING_DIM = 256;

// ─── Challenge ───────────────────────────────────────────────

export const CHALLENGE_MIN_TIER: Tier = 'GOLD';
export const CHALLENGE_MIN_AGENT_MATCHES = 10;
export const CHALLENGE_MAX_REASON_LENGTH = 280;

// ─── LIVE ────────────────────────────────────────────────────

export const LIVE_MIN_TIER: Tier = 'DIAMOND';
export const LIVE_MIN_MATCHES = 50;
export const LIVE_PNL_UPDATE_INTERVAL_SEC = 10;
export const LIVE_ALLOWED_REACTIONS = ['🔥', '🧊', '🤔', '⚡', '💀'] as const;

// ─── Data Collection ─────────────────────────────────────────

export const SNAPSHOT_INTERVALS = {
  klines: 30_000,         // 30초
  oi: 60_000,             // 1분
  funding_rate: 28_800_000,  // 8시간
  ls_ratio: 60_000,       // 1분
  liquidations: 60_000,   // 1분
  fear_greed: 3_600_000,  // 1시간
  btc_dominance: 300_000, // 5분
  dxy: 300_000,           // 5분
  equity: 300_000,        // 5분
  yield: 300_000,         // 5분
  stablecoin_mcap: 3_600_000, // 1시간
  mvrv: 3_600_000,        // 1시간
  exchange_flows: 300_000, // 5분
  whale_txns: 60_000,     // 1분
  social_volume: 3_600_000, // 1시간
};

// ─── Notification ────────────────────────────────────────────

export const NOTIFICATION_LEVELS = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;
export type NotificationLevel = (typeof NOTIFICATION_LEVELS)[number];

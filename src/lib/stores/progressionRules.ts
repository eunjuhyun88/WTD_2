// ═══════════════════════════════════════════════════════════════
// STOCKCLAW — Unified Progression Contract (S-02)
// ═══════════════════════════════════════════════════════════════
//
// 단일 소스: LP 기반 Tier + Phase 통합.
// walletStore, userProfileStore, agentData 모두 이 규칙만 참조.
// constants.ts의 TIER_TABLE/getTierForLP와 완전 일치.

import type { Tier } from '$lib/engine/types';
import { TIER_TABLE, SPEC_UNLOCK_A, SPEC_UNLOCK_B, SPEC_UNLOCK_C, getTierForLP } from '$lib/engine/constants';

// ─── Progression State (계약 인터페이스) ─────────────────────
export interface ProgressionState {
  lp: number;
  totalMatches: number;
  wins: number;
  losses: number;
  streak: number;
  currentTier: Tier;
  tierLevel: number;           // Diamond I/II/III 등
  phase: number;               // 0-5 (레거시 호환)
  unlockedSpecTiers: ('base' | 'a' | 'b' | 'c')[];
  agentMatchCounts: Record<string, number>;
}

// ─── Tier ↔ Phase 매핑 (LP 임계값 기준 통일) ────────────────
//
// LP 0-199    → BRONZE  → Phase 1 (첫 매치 이후)
// LP 200-599  → SILVER  → Phase 2
// LP 600-1199 → GOLD    → Phase 3
// LP 1200+    → DIAMOND → Phase 4
// LP 2200+    → MASTER  → Phase 5

const TIER_PHASE_MAP: Record<Tier, number> = {
  BRONZE: 1,
  SILVER: 2,
  GOLD: 3,
  DIAMOND: 4,
  MASTER: 5,
};

// ─── Core: LP → Tier ─────────────────────────────────────────
// 단일 소스: constants.ts의 getTierForLP 사용. 래퍼만 유지 (호환).
export function getTier(lp: number): { tier: Tier; level: number } {
  return getTierForLP(Math.max(0, Math.floor(lp || 0)));
}

// ─── Core: LP + matches → Phase (레거시 호환) ────────────────
export function resolveLifecyclePhase(matchesPlayed: number, totalLP: number): number {
  const matches = Math.max(0, Math.floor(matchesPlayed || 0));
  if (matches === 0) return 0;

  const { tier } = getTier(totalLP);
  return TIER_PHASE_MAP[tier];
}

// ─── Spec 해금 판정 ──────────────────────────────────────────
export function getUnlockedSpecTiers(agentMatchCount: number): ('base' | 'a' | 'b' | 'c')[] {
  const tiers: ('base' | 'a' | 'b' | 'c')[] = ['base'];
  if (agentMatchCount >= SPEC_UNLOCK_A) tiers.push('a');
  if (agentMatchCount >= SPEC_UNLOCK_B) tiers.push('b');
  if (agentMatchCount >= SPEC_UNLOCK_C) tiers.push('c');
  return tiers;
}

// ─── Agent Level (매치 수 기반) ──────────────────────────────
export function resolveAgentLevelFromMatches(matchCount: number): { level: number; xp: number; xpMax: number } {
  const matches = Math.max(0, Math.floor(matchCount || 0));
  const level = Math.min(10, 1 + Math.floor(matches / 10));
  const xpMax = 100 + (level - 1) * 50;
  const progressInLevel = matches % 10;
  const xp = Math.round((progressInLevel / 10) * xpMax);
  return { level, xp, xpMax };
}

// ─── Full Progression 계산 ───────────────────────────────────
export function resolveProgression(input: {
  lp: number;
  totalMatches: number;
  wins: number;
  losses: number;
  streak: number;
  agentMatchCounts?: Record<string, number>;
}): ProgressionState {
  const { tier, level } = getTier(input.lp);
  const phase = input.totalMatches === 0 ? 0 : TIER_PHASE_MAP[tier];
  const agentMatchCounts = input.agentMatchCounts ?? {};

  // 모든 에이전트 중 가장 많이 플레이한 에이전트 기준으로 spec 해금 판정
  const maxAgentMatches = Math.max(0, ...Object.values(agentMatchCounts));
  const unlockedSpecTiers = getUnlockedSpecTiers(maxAgentMatches);

  return {
    lp: input.lp,
    totalMatches: input.totalMatches,
    wins: input.wins,
    losses: input.losses,
    streak: input.streak,
    currentTier: tier,
    tierLevel: level,
    phase,
    unlockedSpecTiers,
    agentMatchCounts,
  };
}

// ─── Tier 비교 헬퍼 ──────────────────────────────────────────
const TIER_ORDER: Record<Tier, number> = {
  BRONZE: 0, SILVER: 1, GOLD: 2, DIAMOND: 3, MASTER: 4,
};

export function isTierAtLeast(current: Tier, required: Tier): boolean {
  return TIER_ORDER[current] >= TIER_ORDER[required];
}

// ─── Display 변환 (ProfileTier 호환) ────────────────────────
export function tierToDisplay(tier: Tier): string {
  return tier.toLowerCase();
}

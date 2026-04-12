// ═══════════════════════════════════════════════════════════════
// COGOCHI — DOUNI State System (4 stats + bonus)
// ═══════════════════════════════════════════════════════════════
// 핵심 원칙: **낮아도 기본 성능 100%. 높으면 보너스.**
// 감정 연출(Sleep, Sad)은 유지하되, 기능을 깎지 않는다.

import type { DouniStage } from './douniPersonality';

// ─── State Interface ─────────────────────────────────────────

export interface DouniState {
  energy: number;    // 0~100
  mood: number;      // 0~100
  focus: number;     // 0~100
  trust: number;     // 0~100
}

/** 기본 초기값 (생성 직후) */
export function createInitialState(): DouniState {
  return { energy: 80, mood: 60, focus: 50, trust: 30 };
}

// ─── Bonuses ─────────────────────────────────────────────────

/** 높은 상태(71+)일 때 보너스 */
export interface DouniBonus {
  /** Energy 71+: 스캔 주기 5분 (기본 15분) */
  fastScan: boolean;
  /** Mood 71+: 추가 인사이트 1줄 */
  extraInsight: boolean;
  /** Focus 71+: 숨겨진 패턴 알림 */
  hiddenPatternAlert: boolean;
  /** Trust 71+: High-Confidence 필터 */
  highConfidenceFilter: boolean;
}

export function computeBonuses(state: DouniState): DouniBonus {
  return {
    fastScan: state.energy >= 71,
    extraInsight: state.mood >= 71,
    hiddenPatternAlert: state.focus >= 71,
    highConfidenceFilter: state.trust >= 71,
  };
}

// ─── State Transitions ───────────────────────────────────────

export type StateEvent =
  | { type: 'TIME_DECAY'; hours: number }
  | { type: 'LOGIN' }
  | { type: 'ANALYSIS_COMPLETE' }
  | { type: 'PATTERN_DISCOVERED' }
  | { type: 'SCAN_COMPLETE' }
  | { type: 'HIT' }           // 적중
  | { type: 'MISS' }          // 미적중
  | { type: 'STREAK_LOSS'; count: number }  // 연패
  | { type: 'CONVERSATION' }  // 대화
  | { type: 'BATTLE_EXCESS'; dailyCount: number }; // 배틀 과다

/**
 * 이벤트에 따라 DOUNI 상태를 업데이트한다.
 * 불변(immutable) — 새 객체를 반환.
 */
export function applyStateEvent(state: DouniState, event: StateEvent): DouniState {
  const next = { ...state };

  switch (event.type) {
    case 'TIME_DECAY':
      // Energy: -3%/hr, Trust: -1/day (≈0.04/hr)
      next.energy = clamp(state.energy - event.hours * 3, 0, 100);
      next.trust = clamp(state.trust - event.hours * 0.04, 0, 100);
      break;

    case 'LOGIN':
      next.energy = clamp(state.energy + 5, 0, 100);
      break;

    case 'ANALYSIS_COMPLETE':
      next.energy = clamp(state.energy + 10, 0, 100);
      break;

    case 'PATTERN_DISCOVERED':
      next.focus = clamp(state.focus + 15, 0, 100);
      break;

    case 'SCAN_COMPLETE':
      next.focus = clamp(state.focus + 10, 0, 100);
      break;

    case 'HIT':
      next.mood = clamp(state.mood + 10, 0, 100);
      next.trust = clamp(state.trust + 5, 0, 100);
      break;

    case 'MISS':
      // 패배에도 trust는 조금 오름 (꾸준히 사용하는 것 자체가 신뢰)
      next.trust = clamp(state.trust + 2, 0, 100);
      break;

    case 'STREAK_LOSS':
      if (event.count >= 3) {
        next.mood = clamp(state.mood - 15, 0, 100);
      }
      break;

    case 'CONVERSATION':
      next.mood = clamp(state.mood + 5, 0, 100);
      break;

    case 'BATTLE_EXCESS':
      if (event.dailyCount > 5) {
        next.focus = clamp(state.focus - 5, 0, 100);
      }
      break;
  }

  return next;
}

// ─── Animation State ─────────────────────────────────────────

export type DouniAnimation =
  | 'IDLE'
  | 'THINKING'
  | 'EXCITED'
  | 'HAPPY'
  | 'SAD'
  | 'ALERT'
  | 'SLEEP';

/**
 * DOUNI 상태 + 이벤트 → 현재 보여줄 애니메이션.
 */
export function resolveAnimation(state: DouniState, recentEvent?: StateEvent['type']): DouniAnimation {
  // 이벤트 기반 우선
  if (recentEvent === 'HIT') return 'HAPPY';
  if (recentEvent === 'PATTERN_DISCOVERED') return 'EXCITED';
  if (recentEvent === 'MISS') return 'SAD';

  // 상태 기반
  if (state.energy <= 10) return 'SLEEP';
  if (state.mood <= 20) return 'SAD';
  if (state.mood >= 80) return 'HAPPY';

  return 'IDLE';
}

// ─── Stage Progression ───────────────────────────────────────

export interface StageRequirements {
  stage: DouniStage;
  minPatterns: number;
  unlocks: string;
}

export const STAGE_LADDER: StageRequirements[] = [
  { stage: 'EGG',       minPatterns: 0,   unlocks: '패턴 3개, 스캔 5종목, 기본 인디 5개' },
  { stage: 'CHICK',     minPatterns: 3,   unlocks: '패턴 10개, 스캔 10종목, 인디 15개' },
  { stage: 'FLEDGLING', minPatterns: 10,  unlocks: '패턴 무제한, 전체 마켓 스캔, 인디 40개' },
  { stage: 'DOUNI',     minPatterns: 30,  unlocks: '인디 90+, 학습방법 선택, LoRA Rank 조정' },
  { stage: 'ELDER',     minPatterns: 100, unlocks: '전체 해금, Market 임대 가능, Export' },
];

/**
 * 패턴 수 → 현재 Stage 계산.
 */
export function computeStage(patternCount: number): DouniStage {
  for (let i = STAGE_LADDER.length - 1; i >= 0; i--) {
    if (patternCount >= STAGE_LADDER[i].minPatterns) {
      return STAGE_LADDER[i].stage;
    }
  }
  return 'EGG';
}

/**
 * 다음 Stage까지 남은 패턴 수.
 * ELDER면 0.
 */
export function patternsToNextStage(patternCount: number): number {
  const current = computeStage(patternCount);
  const idx = STAGE_LADDER.findIndex(s => s.stage === current);
  if (idx >= STAGE_LADDER.length - 1) return 0;
  return STAGE_LADDER[idx + 1].minPatterns - patternCount;
}

// ─── Helper ──────────────────────────────────────────────────

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

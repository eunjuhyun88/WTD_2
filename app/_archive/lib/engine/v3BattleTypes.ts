// =================================================================
// WTD Arena v3 — Battle Types
// =================================================================
// HP 시스템 + 차트 리딩 챌린지를 v2 위에 래핑
// v2BattleEngine은 수정 없이 그대로 호출 (canonical)
// =================================================================

import type { AgentId, AgentRole } from './types';
import type { AgentType, AgentTier } from './agentCharacter';
import type {
  V2BattleState,
  V2BattleConfig,
  AgentBattleState,
  AgentAnimState,
  TickResult,
  V2BattleResult,
  ClassifiedTick,
} from './v2BattleTypes';

// ── Per-Agent HP State ─────────────────────────────────────────

export interface V3AgentState {
  agentId: AgentId;
  hp: number;
  maxHP: number;
  isKO: boolean;
  isLead: boolean;
  level: number;
  tier: AgentTier;
  type: AgentType;

  // Damage tracking (for v3 HP system, separate from v2 VS damage)
  totalHPDamageDealt: number;
  totalHPDamageReceived: number;
  totalHPHealed: number;
}

// ── Chart Reading Challenge ────────────────────────────────────

export type ChallengeType =
  | 'direction_call'
  | 'pattern_recognition'
  | 'risk_decision'
  | 'quick_reaction';

export interface ChartChallenge {
  id: string;
  type: ChallengeType;
  triggeredAtTick: number;
  timeoutMs: number;            // 3000-5000ms
  expiresAt: number;            // timestamp when challenge expires

  // Question content
  prompt: string;               // 질문 텍스트
  options: string[];             // 선택지
  correctAnswer: string;        // 정답

  // Player response
  playerAnswer: string | null;
  answeredAt: number | null;
  result: 'correct' | 'wrong' | 'timeout' | 'pending';

  // Effect applied
  bonusApplied: ChallengeBonus | null;
}

export interface ChallengeBonus {
  type: 'hp_damage' | 'hp_heal' | 'vs_shift' | 'combo_boost' | 'signature_activate';
  value: number;
  description: string;
  targetAgentId?: AgentId;
}

// ── Challenge Definitions ──────────────────────────────────────

export const CHALLENGE_CONFIG = {
  /** 챌린지 발생 주기 (틱 수) */
  TRIGGER_INTERVAL: 4,

  /** Direction Call */
  DIRECTION_CALL: {
    timeoutMs: 5000,
    correctBonus: { vs: 5, burstMultiplier: 2.0 },
    wrongPenalty: { vs: -3, idleTicks: 1 },
  },

  /** Pattern Recognition */
  PATTERN_RECOGNITION: {
    timeoutMs: 6000,
    patterns: ['BOS', 'CHoCH', 'FVG', 'ORDER_BLOCK', 'VOLUME_CLIMAX',
               'DIVERGENCE', 'LIQUIDITY_SWEEP', 'ABSORPTION'] as const,
    correctBonus: { signatureActivate: true },
    // No penalty for wrong answer (learning opportunity)
  },

  /** Risk Decision */
  RISK_DECISION: {
    timeoutMs: 4000,
    vsThresholdLow: 35,
    vsThresholdHigh: 65,
    correctMultiplier: 1.5,
    wrongMultiplier: 2.0,   // damage multiplier on wrong choice
  },

  /** Quick Reaction */
  QUICK_REACTION: {
    timeoutMs: 3000,
    dodgePercent: 0.5,      // 50% damage dodge
    counterBonus: 5,        // VS counter bonus
  },
} as const;

// ── HP Formulas ────────────────────────────────────────────────

export const HP_CONFIG = {
  /** HP = (BASE + resilience * RESILIENCE_MULT) * tierBonus * levelScale */
  BASE_HP: 60,
  RESILIENCE_MULT: 1.2,
  LEVEL_SCALE_PER: 0.02,       // +2% per level

  /** Tier HP bonuses */
  TIER_BONUS: { 1: 1.0, 2: 1.15, 3: 1.30 } as Record<AgentTier, number>,

  /** Damage from market ticks (before defense/type) */
  TICK_DAMAGE: {
    STRONG_UNFAVORABLE: 30,
    UNFAVORABLE: 15,
    NEUTRAL: 2,
    FAVORABLE: 0,
    STRONG_FAVORABLE: 0,
  } as Record<string, number>,

  /** Heal from favorable ticks */
  TICK_HEAL: {
    STRONG_FAVORABLE: 20,
    FAVORABLE: 10,
    NEUTRAL: 0,
    UNFAVORABLE: 0,
    STRONG_UNFAVORABLE: 0,
  } as Record<string, number>,

  /** Defense reduction factor (accuracy * this) */
  DEFENSE_FACTOR: 0.12,

  /** Shield damage reduction when active */
  SHIELD_REDUCTION: 0.4,       // take 40% damage (60% reduction)

  /** VS Momentum buffs */
  VS_HIGH_THRESHOLD: 60,
  VS_LOW_THRESHOLD: 40,
  VS_DAMAGE_BUFF: 0.15,        // +15% damage when VS > 60
  VS_HEAL_BUFF: 0.10,          // +10% healing when VS > 60
} as const;

// ── Lead / Switch System ───────────────────────────────────────

export const SWITCH_CONFIG = {
  COOLDOWN_TICKS: 3,
  GUARD_COOLDOWN_TICKS: 5,
  GUARD_REDUCTION: 0.5,       // 50% less damage for 2 ticks
  GUARD_DURATION_TICKS: 2,
} as const;

// ── v3 Full Battle State ───────────────────────────────────────

export interface V3BattleState {
  // Wraps v2 (delegates tick pipeline)
  v2State: V2BattleState;

  // Per-agent HP state
  humanAgents: V3AgentState[];
  aiAgents: V3AgentState[];

  // Lead system
  humanLeadIdx: number;         // index into humanAgents[]
  aiLeadIdx: number;

  // Switch/Guard cooldowns
  switchCooldown: number;       // ticks remaining
  guardCooldown: number;
  guardActiveTicksLeft: number;

  // Challenge system
  challenges: ChartChallenge[];
  activeChallenge: ChartChallenge | null;
  challengeScore: {
    correct: number;
    wrong: number;
    timeout: number;
    total: number;
  };

  // Forced states from challenge results
  forcedIdleTicksLeft: number;  // lead agent forced IDLE from wrong direction call

  // Overall v3 status
  v3Status: 'running' | 'human_team_ko' | 'ai_team_ko' | 'finished';
  koEvents: KOEvent[];
}

export interface KOEvent {
  tickN: number;
  agentId: AgentId;
  side: 'human' | 'ai';
  killerAgentId?: AgentId;
}

// ── v3 Tick Result (extends v2) ────────────────────────────────

export interface V3TickResult {
  v2Result: TickResult;

  // HP changes this tick
  hpChanges: HPChange[];

  // Challenge triggered this tick?
  challengeTriggered: ChartChallenge | null;
  challengeResolved: ChartChallenge | null;

  // KO events this tick
  koEvents: KOEvent[];

  // Lead switches
  leadSwitchOccurred: boolean;
}

export interface HPChange {
  agentId: AgentId;
  side: 'human' | 'ai';
  previousHP: number;
  damage: number;
  heal: number;
  newHP: number;
  source: 'tick' | 'challenge' | 'signature' | 'switch_in';
  typeMultiplier?: number;
  wasCritical?: boolean;
}

// ── Initialization Config ──────────────────────────────────────

export interface V3BattleInitConfig {
  v2Config: V2BattleConfig;

  humanTeam: {
    agentId: AgentId;
    level: number;
    tier: AgentTier;
    type: AgentType;
    resilience: number;         // for HP calculation
    accuracy: number;           // for defense
  }[];

  aiTeam: {
    agentId: AgentId;
    level: number;
    tier: AgentTier;
    type: AgentType;
    resilience: number;
    accuracy: number;
  }[];
}

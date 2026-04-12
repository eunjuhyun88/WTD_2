// =================================================================
// STOCKCLAW Arena v2 — Battle Types
// =================================================================
// Core type definitions for the game-mechanic battle system.
// This layer sits ON TOP of the existing battleResolver (real BTC price)
// and adds: tick classification, agent actions, VS meter, energy,
// combos, critical hits, and effective TP/SL adjustment.
// =================================================================

import type { Direction, AgentId, AgentRole } from './types';

// ── Tick Classification ─────────────────────────────────────────

/** ATR-relative tick magnitude classification */
export type TickClass =
  | 'STRONG_FAVORABLE'    // user dir AND |delta| > 0.6 * ATR
  | 'FAVORABLE'           // user dir AND |delta| > 0.15 * ATR
  | 'NEUTRAL'             // |delta| <= 0.15 * ATR
  | 'UNFAVORABLE'         // opposite dir AND |delta| > 0.15 * ATR
  | 'STRONG_UNFAVORABLE'; // opposite dir AND |delta| > 0.6 * ATR

export interface ClassifiedTick {
  tickN: number;           // 0-indexed tick number
  timestamp: number;
  prevPrice: number;
  currentPrice: number;
  delta: number;           // raw price delta
  deltaPct: number;        // % change
  atrRef: number;          // ATR_1m reference at battle start
  tickClass: TickClass;
  isFavorable: boolean;    // true if FAVORABLE or STRONG_FAVORABLE
}

// ── Agent Action System ─────────────────────────────────────────

/** 8 action types available to agents */
export type ActionType =
  | 'DASH'       // forward attack (base 3.0)
  | 'BURST'      // big swing attack (base 7.0)
  | 'FINISHER'   // ultimate attack (base 12.0)
  | 'SHIELD'     // absorb 60% damage
  | 'PING'       // scout + 0.5 VS + buff next
  | 'HOOK'       // pull VS toward center (base 2.0)
  | 'ASSIST'     // buff next allied action +40%
  | 'TAUNT'      // debuff market next action -20%
  | 'IDLE'       // no action (exhausted or strong unfavorable)
  | 'RECOVER';   // rest + regain 8 energy

/** Energy cost per action */
export const ACTION_ENERGY_COST: Record<ActionType, number> = {
  DASH: 12,
  BURST: 25,
  FINISHER: 60,
  SHIELD: 15,
  PING: 8,
  HOOK: 18,
  ASSIST: 10,
  TAUNT: 14,
  IDLE: 0,
  RECOVER: 0,
};

/** Base effect value per action */
export const ACTION_BASE_EFFECT: Record<ActionType, number> = {
  DASH: 3.0,
  BURST: 7.0,
  FINISHER: 12.0,
  SHIELD: 0.6,     // 60% absorption ratio
  PING: 0.5,       // 0.5 VS + buff
  HOOK: 2.0,       // pull VS toward center
  ASSIST: 0.4,     // +40% next allied action
  TAUNT: 0.2,      // -20% next market action
  IDLE: 0,
  RECOVER: 8,      // energy regain
};

/** Which stat drives each action's effectiveness */
export const ACTION_STAT_MAP: Record<ActionType, 'analysis' | 'accuracy' | 'speed' | 'instinct'> = {
  DASH: 'analysis',
  BURST: 'analysis',
  FINISHER: 'analysis',
  SHIELD: 'accuracy',
  PING: 'speed',
  HOOK: 'instinct',
  ASSIST: 'speed',
  TAUNT: 'instinct',
  IDLE: 'speed',
  RECOVER: 'speed',
};

// ── Agent Battle State ──────────────────────────────────────────

/** Per-agent abilities (from agent definitions) */
export interface AgentAbilities {
  analysis: number;   // 0-100
  accuracy: number;   // 0-100
  speed: number;      // 0-100
  instinct: number;   // 0-100
}

/** 9 animation states for agent sprites */
export type AgentAnimState =
  | 'IDLE'
  | 'PATROL'
  | 'LOCK'
  | 'WINDUP'
  | 'CAST'
  | 'IMPACT'
  | 'RECOVER'
  | 'CELEBRATE'
  | 'PANIC';

/** Per-agent state during battle */
export interface AgentBattleState {
  agentId: AgentId;
  role: AgentRole;
  weight: number;           // draft weight (10-80)
  abilities: AgentAbilities;

  // Runtime
  energy: number;           // 0-100
  maxEnergy: number;        // 100
  isExhausted: boolean;     // true when energy hits 0 (2 ticks forced)
  exhaustedTicksLeft: number;

  // Current action
  currentAction: ActionType;
  animState: AgentAnimState;

  // Buffs / debuffs
  assistBuffActive: boolean;   // next action +40%
  assistBuffMult: number;
  tauntDebuffActive: boolean;  // next action -20%

  // Finding validation
  findingValidated: boolean | null; // null = not yet checked
  findingBuff: number;             // +0.15 or -0.10

  // Stats tracking
  totalDamageDealt: number;
  totalDamageBlocked: number;
  actionsPerformed: number;
  criticalHits: number;
}

// ── Battle Action Result ────────────────────────────────────────

/** Result of a single agent action in a tick */
export interface BattleActionResult {
  agentId: AgentId;
  action: ActionType;
  isCritical: boolean;

  // Effect calculation breakdown
  baseEffect: number;
  statMult: number;
  weightMult: number;
  tickAlignBonus: number;
  comboBonus: number;
  synergyBonus: number;
  assistBuff: number;
  findingBuff: number;

  finalEffect: number;       // final VS contribution
  energyCost: number;
  energyAfter: number;

  // Visual
  animState: AgentAnimState;
  damageNumber: number | null;   // floating damage number to show
  damageColor: string;           // 'green' | 'red' | 'gold'
  speechBubble: string | null;   // agent quip
}

// ── Combo System ────────────────────────────────────────────────

export interface ComboState {
  count: number;            // current consecutive favorable hits
  maxCombo: number;         // best combo this battle
  isProtected: boolean;     // SHIELD active = combo doesn't reset on unfavorable
  lastBreakTick: number;    // tick when combo last broke
}

/** Combo thresholds for visual effects */
export const COMBO_THRESHOLDS = {
  DOUBLE: 2,    // "2-HIT COMBO!"
  TRIPLE: 3,    // sync attack + gold lightning
  QUAD: 4,      // finisher unlock + gold border
  MAX_BONUS: 5, // combo bonus caps at 0.40
} as const;

// ── VS Meter ────────────────────────────────────────────────────

export interface VSMeterState {
  value: number;            // 0-100, 50 = neutral
  startValue: number;       // tier-dependent starting value
  history: number[];        // value at each tick for sparkline
}

// ── Critical Hit ────────────────────────────────────────────────

export interface CriticalState {
  baseCritRate: number;     // 0.12 base
  currentCritRate: number;  // after all modifiers
  totalCrits: number;
}

// ── Battle Log ──────────────────────────────────────────────────

export type BattleLogType = 'action' | 'combo' | 'critical' | 'system' | 'milestone';

export interface BattleLogEntry {
  tickN: number;
  timestamp: number;
  type: BattleLogType;
  message: string;
  color?: string;
  icon?: string;
}

// ── Milestone Events ────────────────────────────────────────────

export type MilestoneType =
  | 'APPROACHING_TP'       // within 20% of TP
  | 'DANGER_ZONE'          // within 20% of SL
  | 'COMBO_DOUBLE'         // 2-hit combo
  | 'COMBO_TRIPLE'         // 3-hit combo
  | 'COMBO_QUAD'           // 4-hit combo
  | 'FINISHER_READY'       // finisher unlocked
  | 'EXHAUSTED'            // agent ran out of energy
  | 'CRITICAL_HIT'         // crit triggered
  | 'FINDING_VALIDATED'    // finding confirmed
  | 'FINDING_CHALLENGED'   // finding disproven
  | 'SYNERGY_ACTIVATED';   // team synergy proc'd

export interface BattleMilestone {
  tickN: number;
  type: MilestoneType;
  detail: string;
  agentId?: AgentId;
  screenShakeIntensity: number;  // 0-12 px
  screenShakeDuration: number;   // ms
}

// ── Player Battle Actions ───────────────────────────────────────

export type PlayerActionType = 'TACTICAL_FOCUS' | 'EMERGENCY_RECALL';

export interface PlayerAction {
  type: PlayerActionType;
  targetAgentId: AgentId;
  tickUsed: number;
  cooldownUntilTick: number;
}

export interface PlayerActionState {
  tacticalFocusUsesLeft: number;   // starts at 2
  emergencyRecallUsesLeft: number; // starts at 1
  tacticalFocusCooldownTick: number; // -1 = ready
  activeFocusAgentId: AgentId | null;
  activeFocusTicksLeft: number;    // 3 actions
}

// ── Full Battle State ───────────────────────────────────────────

export interface V2BattleConfig {
  // Position
  entryPrice: number;
  tpPrice: number;
  slPrice: number;
  direction: Direction;

  // Team
  agents: V2BattleAgent[];
  synergyIds: string[];          // active synergy IDs

  // Context from analysis
  councilConsensus: 'unanimous' | 'majority' | 'split';
  hypothesisRR: number;
  findingDirections: Record<AgentId, Direction>; // per-agent finding dir

  // Tier difficulty
  tierVSStart: number;           // 45-55 depending on tier
  tierTickCount: number;         // 16-24 depending on tier
  tierAIBonus: number;           // 0-0.15

  // ATR reference
  atr1m: number;
}

export interface V2BattleAgent {
  agentId: AgentId;
  role: AgentRole;
  weight: number;
  abilities: AgentAbilities;
  specBonuses: SpecBonuses;
}

export interface SpecBonuses {
  primaryActionBonus: number;    // +5% or +10%
  secondaryActionPenalty: number; // -5% or -8%
  critBonus: number;             // 0 or +3%
  targetActions: ActionType[];   // which actions get the bonus
}

/** Full state of a v2 battle at any point in time */
export interface V2BattleState {
  // Config (immutable after start)
  config: V2BattleConfig;

  // Timing
  tickN: number;                 // current tick (0-indexed)
  maxTicks: number;              // tier-dependent (16-24)
  tickIntervalMs: number;        // 1500ms
  battleStartTime: number;
  lastTickTime: number;

  // Price
  currentPrice: number;
  priceHistory: Array<{ tick: number; price: number }>;

  // VS Meter
  vsMeter: VSMeterState;

  // Effective TP/SL (adjusted by VS meter)
  effectiveTPDistance: number;    // modified by VS
  effectiveSLDistance: number;    // modified by VS
  slShieldBonus: number;         // defense agents' SL cushion

  // Agents
  agentStates: Record<string, AgentBattleState>;

  // Combo
  combo: ComboState;

  // Critical
  critical: CriticalState;

  // Player actions
  playerActions: PlayerActionState;

  // Battle log
  log: BattleLogEntry[];
  milestones: BattleMilestone[];

  // Tick results
  tickResults: TickResult[];

  // Overall
  status: 'waiting' | 'running' | 'finished';
  result: V2BattleResult | null;

  // Buffs from analysis phase
  councilBuff: number;           // +0.10 (unanimous), +0.03 (majority), -0.05 (split)
  hypothesisRRBuff: number;      // +0.05 (RR>=3), +0.02 (RR>=2), -0.05 (RR<1.5)
}

/** Result of processing a single tick */
export interface TickResult {
  tickN: number;
  classifiedTick: ClassifiedTick;
  agentActions: BattleActionResult[];
  vsChange: number;
  vsBefore: number;
  vsAfter: number;
  comboBefore: number;
  comboAfter: number;
  milestones: BattleMilestone[];
  logEntries: BattleLogEntry[];
}

/** Final battle result */
export interface V2BattleResult {
  outcome: 'tp_hit' | 'sl_hit' | 'timeout_win' | 'timeout_loss';
  finalVS: number;
  finalPnL: number;
  maxCombo: number;
  totalTicks: number;
  totalCrits: number;
  agentMVP: AgentId;             // highest total damage dealt

  // Per-agent report
  agentReports: AgentBattleReport[];
}

export interface AgentBattleReport {
  agentId: AgentId;
  totalDamage: number;
  totalBlocked: number;
  actionsPerformed: number;
  criticalHits: number;
  findingValidated: boolean | null;
  energyEfficiency: number;      // damage / energy spent
  mvpScore: number;
}

// ── Screen Shake Table ──────────────────────────────────────────

export const SCREEN_SHAKE_TABLE: Record<string, { px: number; ms: number }> = {
  'small_favorable':    { px: 2,  ms: 100 },
  'large_tick':         { px: 5,  ms: 200 },
  'combo_2':            { px: 4,  ms: 150 },
  'combo_3':            { px: 6,  ms: 200 },
  'combo_4':            { px: 8,  ms: 300 },
  'tp_hit':             { px: 10, ms: 500 },
  'sl_hit':             { px: 8,  ms: 400 },
  'finisher':           { px: 12, ms: 600 },
  'critical':           { px: 6,  ms: 250 },
};

// ── Constants ───────────────────────────────────────────────────

export const V2_BATTLE_CONSTANTS = {
  TICK_INTERVAL_MS: 1500,
  MAX_ENERGY: 100,
  START_ENERGY: 100,
  ENERGY_REGEN_BASE: 3,          // per tick
  EXHAUSTED_TICKS: 2,            // forced idle when 0 energy
  EXHAUSTED_DAMAGE_MULT: 1.5,    // take 50% more "damage" when exhausted

  COMBO_BONUS_PER: 0.08,         // +8% per combo
  COMBO_BONUS_CAP: 0.40,         // max +40% (at combo 5)

  CRIT_BASE_RATE: 0.12,          // 12% base
  CRIT_MIN_RATE: 0.05,           // 5% floor
  CRIT_MAX_RATE: 0.35,           // 35% ceiling
  CRIT_DAMAGE_MULT: 2.0,         // 2x on crit
  CRIT_COMBO_BONUS: 2,           // crit adds +2 to combo

  VS_NEUTRAL: 50,
  VS_MIN: 0,
  VS_MAX: 100,

  // VS → effective TP/SL adjustment
  VS_TP_ADJUST_DIVISOR: 200,     // effectiveTP = orig * (1 + (vs-50)/200)
  VS_SL_ADJUST_DIVISOR: 400,     // effectiveSL = orig * (1 - (vs-50)/400)

  // Instinct override threshold
  INSTINCT_OVERRIDE_DIVISOR: 400,

  // Finding validation
  FINDING_VALIDATE_TICKS: 4,     // check first 4 ticks
  FINDING_VALIDATED_BUFF: 0.15,  // +15% all actions
  FINDING_CHALLENGED_DEBUFF: -0.10, // -10% all actions

  // Tactical Focus
  TACTICAL_FOCUS_BUFF: 0.40,     // +40% to target
  TACTICAL_FOCUS_PENALTY: -0.15, // -15% to others
  TACTICAL_FOCUS_DURATION: 3,    // 3 actions
  TACTICAL_FOCUS_COOLDOWN: 5,    // 5 ticks

  // Emergency Recall
  EMERGENCY_RECALL_ENERGY: 20,   // instant +20 energy
  EMERGENCY_RECALL_BRACE: 0.40,  // team -40% damage taken for 1 tick

  // Council consensus buffs
  COUNCIL_UNANIMOUS_BUFF: 0.10,
  COUNCIL_MAJORITY_BUFF: 0.03,
  COUNCIL_SPLIT_DEBUFF: -0.05,

  // Hypothesis R:R buffs
  RR_GREAT_BUFF: 0.05,          // R:R >= 3.0
  RR_GOOD_BUFF: 0.02,           // R:R >= 2.0
  RR_BAD_DEBUFF: -0.05,         // R:R < 1.5

  // Tick classification thresholds (relative to ATR)
  TICK_STRONG_THRESHOLD: 0.6,    // > 0.6 * ATR
  TICK_NORMAL_THRESHOLD: 0.15,   // > 0.15 * ATR

  // Favorable tick alignment bonus
  TICK_STRONG_ALIGN: 0.20,       // strong favorable = +20%
  TICK_NORMAL_ALIGN: 0.10,       // favorable = +10%
} as const;

// ── Tier Difficulty Scaling ─────────────────────────────────────

export interface TierDifficulty {
  vsStart: number;
  maxTicks: number;
  aiBonus: number;
  slCushionReduction: number;    // 0 = no reduction
}

export const TIER_DIFFICULTY: Record<string, TierDifficulty> = {
  BRONZE:  { vsStart: 55, maxTicks: 24, aiBonus: 0,    slCushionReduction: 0 },
  SILVER:  { vsStart: 50, maxTicks: 24, aiBonus: 0,    slCushionReduction: 0 },
  GOLD:    { vsStart: 50, maxTicks: 20, aiBonus: 0.05, slCushionReduction: 0 },
  DIAMOND: { vsStart: 45, maxTicks: 20, aiBonus: 0.10, slCushionReduction: 0 },
  MASTER:  { vsStart: 45, maxTicks: 16, aiBonus: 0.15, slCushionReduction: 0.30 },
};

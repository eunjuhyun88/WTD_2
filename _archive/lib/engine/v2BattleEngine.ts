// =================================================================
// STOCKCLAW Arena v2 — Battle Engine
// =================================================================
// The BRAIN of the battle system. Transforms raw BTC price ticks
// into a living, stat-driven combat experience.
//
// Pipeline per tick:
//   1. Classify tick (ATR-relative)
//   2. Select actions for each agent (deterministic + instinct override)
//   3. Calculate effects (stat × weight × combo × synergy × buffs)
//   4. Apply to VS meter
//   5. Update energy, combo, crits
//   6. Adjust effective TP/SL
//   7. Check milestones (approaching TP/SL, combo thresholds)
//   8. Generate battle log + visual events
// =================================================================

import type { Direction, AgentId, AgentRole } from './types';
import type {
  TickClass,
  ClassifiedTick,
  ActionType,
  AgentBattleState,
  AgentAbilities,
  AgentAnimState,
  BattleActionResult,
  ComboState,
  VSMeterState,
  CriticalState,
  BattleLogEntry,
  BattleMilestone,
  MilestoneType,
  PlayerActionState,
  PlayerActionType,
  V2BattleConfig,
  V2BattleState,
  V2BattleAgent,
  V2BattleResult,
  AgentBattleReport,
  TickResult,
  SpecBonuses,
} from './v2BattleTypes';
import type { SynergyBonuses } from './teamSynergy';
import {
  ACTION_ENERGY_COST,
  ACTION_BASE_EFFECT,
  ACTION_STAT_MAP,
  COMBO_THRESHOLDS,
  SCREEN_SHAKE_TABLE,
  V2_BATTLE_CONSTANTS as C,
} from './v2BattleTypes';
import { getCombinedSynergyBonuses } from './teamSynergy';

// ── 1. Tick Classification ──────────────────────────────────────

/**
 * Classify a price tick relative to ATR and user direction.
 */
export function classifyTick(
  tickN: number,
  prevPrice: number,
  currentPrice: number,
  atrRef: number,
  userDirection: Direction
): ClassifiedTick {
  const delta = currentPrice - prevPrice;
  const deltaPct = prevPrice > 0 ? (delta / prevPrice) * 100 : 0;
  const absDelta = Math.abs(delta);

  // Direction alignment: is this tick moving in the user's favor?
  const isLong = userDirection === 'LONG';
  const movesInFavor = isLong ? delta > 0 : delta < 0;
  const movesAgainst = isLong ? delta < 0 : delta > 0;

  let tickClass: TickClass;

  if (absDelta <= C.TICK_NORMAL_THRESHOLD * atrRef) {
    tickClass = 'NEUTRAL';
  } else if (movesInFavor && absDelta > C.TICK_STRONG_THRESHOLD * atrRef) {
    tickClass = 'STRONG_FAVORABLE';
  } else if (movesInFavor) {
    tickClass = 'FAVORABLE';
  } else if (movesAgainst && absDelta > C.TICK_STRONG_THRESHOLD * atrRef) {
    tickClass = 'STRONG_UNFAVORABLE';
  } else {
    tickClass = 'UNFAVORABLE';
  }

  // NEUTRAL direction = everything is NEUTRAL
  if (userDirection === 'NEUTRAL') {
    tickClass = 'NEUTRAL';
  }

  return {
    tickN,
    timestamp: Date.now(),
    prevPrice,
    currentPrice,
    delta,
    deltaPct,
    atrRef,
    tickClass,
    isFavorable: tickClass === 'FAVORABLE' || tickClass === 'STRONG_FAVORABLE',
  };
}

// ── 2. Action Selection ─────────────────────────────────────────

/**
 * Deterministic action selection based on tick class, agent role, and state.
 * With instinct-based override chance for more dramatic plays.
 */
export function selectAction(
  agent: AgentBattleState,
  tick: ClassifiedTick,
  combo: ComboState,
  synergyBonuses: SynergyBonuses,
  _battleState: V2BattleState
): ActionType {
  // Exhausted agents must IDLE
  if (agent.isExhausted) return 'IDLE';

  // Get base action from lookup table
  let action = getBaseAction(agent.role, tick.tickClass, combo.count);

  // Check if agent can afford the action
  const cost = getActionCost(action, synergyBonuses);
  if (agent.energy < cost) {
    // Fall back to cheaper actions
    action = findAffordableAction(agent, tick.tickClass);
  }

  // Instinct override: chance to upgrade to a riskier/more dramatic action
  const instinct = agent.abilities.instinct + synergyBonuses.instinctBonus;
  const overrideChance = instinct / C.INSTINCT_OVERRIDE_DIVISOR;
  if (Math.random() < overrideChance) {
    const override = getInstinctOverride(action, agent, tick);
    if (override && agent.energy >= getActionCost(override, synergyBonuses)) {
      action = override;
    }
  }

  return action;
}

/**
 * Base action lookup table (deterministic, no randomness).
 * Rows: tick class. Columns: agent role.
 */
function getBaseAction(
  role: AgentRole,
  tickClass: TickClass,
  comboCount: number
): ActionType {
  // Special: combo >= 4 + favorable = FINISHER for offense
  if (comboCount >= COMBO_THRESHOLDS.QUAD && role === 'OFFENSE' &&
      (tickClass === 'FAVORABLE' || tickClass === 'STRONG_FAVORABLE')) {
    return 'FINISHER';
  }

  const table: Record<TickClass, Record<AgentRole, ActionType>> = {
    STRONG_FAVORABLE: {
      OFFENSE: comboCount >= COMBO_THRESHOLDS.DOUBLE ? 'BURST' : 'DASH',
      DEFENSE: 'ASSIST',
      CONTEXT: 'ASSIST',
    },
    FAVORABLE: {
      OFFENSE: 'DASH',
      DEFENSE: 'ASSIST',
      CONTEXT: 'PING',
    },
    NEUTRAL: {
      OFFENSE: 'PING',
      DEFENSE: 'PING',
      CONTEXT: 'HOOK',
    },
    UNFAVORABLE: {
      OFFENSE: 'HOOK',
      DEFENSE: 'SHIELD',
      CONTEXT: 'HOOK',
    },
    STRONG_UNFAVORABLE: {
      OFFENSE: 'IDLE',
      DEFENSE: 'SHIELD',
      CONTEXT: 'SHIELD',
    },
  };

  return table[tickClass][role];
}

/**
 * Instinct override: occasionally upgrade to a more dramatic action.
 */
function getInstinctOverride(
  baseAction: ActionType,
  agent: AgentBattleState,
  tick: ClassifiedTick
): ActionType | null {
  // Only override on favorable or neutral ticks
  if (tick.tickClass === 'STRONG_UNFAVORABLE') return null;

  const overrides: Partial<Record<ActionType, ActionType>> = {
    DASH: 'BURST',
    PING: 'DASH',
    HOOK: 'TAUNT',
    ASSIST: 'BURST',
    IDLE: 'HOOK',
  };

  return overrides[baseAction] ?? null;
}

/**
 * Find the most useful action the agent can afford.
 */
function findAffordableAction(
  agent: AgentBattleState,
  tickClass: TickClass
): ActionType {
  // Priority: try cheaper actions in order
  const priorities: ActionType[] =
    tickClass === 'UNFAVORABLE' || tickClass === 'STRONG_UNFAVORABLE'
      ? ['SHIELD', 'HOOK', 'PING', 'RECOVER', 'IDLE']
      : ['DASH', 'PING', 'ASSIST', 'RECOVER', 'IDLE'];

  for (const action of priorities) {
    if (agent.energy >= ACTION_ENERGY_COST[action]) {
      return action;
    }
  }
  return 'RECOVER';
}

/**
 * Get energy cost with synergy reductions.
 */
function getActionCost(action: ActionType, synergy: SynergyBonuses): number {
  let cost = ACTION_ENERGY_COST[action];
  if (action === 'FINISHER') {
    cost = Math.max(0, cost - synergy.finisherCostReduction);
  }
  return cost;
}

// ── 3. Effect Calculation ───────────────────────────────────────

/**
 * Calculate the final effect of an agent's action.
 *
 * FINAL_EFFECT = baseEffect × statMult × weightMult × (1 + tickAlign + comboBonus + specBonus + synergy + buffs)
 */
export function calculateActionEffect(
  agent: AgentBattleState,
  action: ActionType,
  tick: ClassifiedTick,
  combo: ComboState,
  synergyBonuses: SynergyBonuses,
  battleState: V2BattleState
): BattleActionResult {
  const baseEffect = getBaseEffect(action, synergyBonuses);

  // Stat multiplier: 1 + (relevantStat - 50) / 200
  const statKey = ACTION_STAT_MAP[action];
  const statValue = agent.abilities[statKey] + (statKey === 'instinct' ? synergyBonuses.instinctBonus : 0);
  const statMult = 1 + (statValue - 50) / 200;

  // Weight multiplier: draftWeight / 33.33
  const weightMult = agent.weight / 33.33;

  // Tick alignment bonus
  let tickAlignBonus = 0;
  if (tick.tickClass === 'STRONG_FAVORABLE') tickAlignBonus = C.TICK_STRONG_ALIGN;
  else if (tick.tickClass === 'FAVORABLE') tickAlignBonus = C.TICK_NORMAL_ALIGN;

  // Combo bonus: min(count × 0.08, 0.40)
  const comboBonus = Math.min(combo.count * C.COMBO_BONUS_PER, C.COMBO_BONUS_CAP);

  // Synergy bonus (all-action + action-specific)
  const synergyBonus = synergyBonuses.allActionBonus +
    (synergyBonuses.actionBonuses[action] ?? 0);

  // Assist buff from previous tick
  const assistBuff = agent.assistBuffActive ? agent.assistBuffMult : 0;

  // Finding validation buff
  const findingBuff = agent.findingBuff;

  // Council + hypothesis buffs
  const contextBuff = battleState.councilBuff + battleState.hypothesisRRBuff;

  // Spec bonuses (role-based action specialization)
  const specBonus = getSpecBonus(action, agent, battleState);

  // Tactical focus
  let focusBuff = 0;
  if (battleState.playerActions.activeFocusAgentId === agent.agentId &&
      battleState.playerActions.activeFocusTicksLeft > 0) {
    focusBuff = C.TACTICAL_FOCUS_BUFF;
  } else if (battleState.playerActions.activeFocusAgentId !== null &&
             battleState.playerActions.activeFocusAgentId !== agent.agentId &&
             battleState.playerActions.activeFocusTicksLeft > 0) {
    focusBuff = C.TACTICAL_FOCUS_PENALTY;
  }

  // AI tier bonus (goes to "market" side — reduces our effectiveness)
  const aiPenalty = -battleState.config.tierAIBonus;

  // Total multiplier
  const totalMult = 1 + tickAlignBonus + comboBonus + synergyBonus +
    assistBuff + findingBuff + contextBuff + specBonus + focusBuff + aiPenalty;

  // Critical hit check
  const isCritical = rollCritical(agent, combo, battleState);

  // Final calculation
  let finalEffect = baseEffect * statMult * weightMult * Math.max(totalMult, 0.1);
  if (isCritical) {
    finalEffect *= C.CRIT_DAMAGE_MULT;
  }

  // Energy cost
  const energyCost = getActionCost(action, synergyBonuses);
  const energyAfter = Math.max(0, agent.energy - energyCost);

  // Determine animation state
  const animState = getAnimForAction(action, isCritical);

  // Damage number for display
  const damageNumber = getDamageNumber(action, finalEffect, tick);
  const damageColor = tick.isFavorable ? (isCritical ? 'gold' : 'green') : 'red';

  // Speech bubble (occasional)
  const speechBubble = getSpeechBubble(agent, action, tick, isCritical);

  return {
    agentId: agent.agentId,
    action,
    isCritical,
    baseEffect,
    statMult,
    weightMult,
    tickAlignBonus,
    comboBonus,
    synergyBonus,
    assistBuff,
    findingBuff,
    finalEffect,
    energyCost,
    energyAfter,
    animState,
    damageNumber,
    damageColor,
    speechBubble,
  };
}

function getBaseEffect(action: ActionType, synergy: SynergyBonuses): number {
  let base = ACTION_BASE_EFFECT[action];
  if (action === 'HOOK') {
    base += synergy.hookEffectBonus;
  }
  return base;
}

function getSpecBonus(action: ActionType, agent: AgentBattleState, battleState: V2BattleState): number {
  const configAgent = battleState.config.agents.find(a => a.agentId === agent.agentId);
  if (!configAgent) return 0;
  const spec = configAgent.specBonuses;

  // Primary action bonus for target actions
  if (spec.targetActions.includes(action)) {
    return spec.primaryActionBonus;
  }

  // Penalty for non-target offensive actions
  const offenseActions: ActionType[] = ['DASH', 'BURST', 'FINISHER'];
  if (offenseActions.includes(action) && !spec.targetActions.includes(action)) {
    return spec.secondaryActionPenalty;
  }

  return 0;
}

function getAnimForAction(action: ActionType, isCritical: boolean): AgentAnimState {
  if (isCritical) return 'CAST';
  const map: Record<ActionType, AgentAnimState> = {
    DASH: 'CAST',
    BURST: 'WINDUP',
    FINISHER: 'WINDUP',
    SHIELD: 'CAST',
    PING: 'LOCK',
    HOOK: 'CAST',
    ASSIST: 'CAST',
    TAUNT: 'CAST',
    IDLE: 'IDLE',
    RECOVER: 'RECOVER',
  };
  return map[action];
}

function getDamageNumber(action: ActionType, effect: number, tick: ClassifiedTick): number | null {
  if (action === 'IDLE' || action === 'RECOVER' || action === 'PING') return null;
  if (action === 'SHIELD') return null; // Shield shows absorption, not damage
  return Math.round(effect * 10) / 10;
}

// ── 4. Critical Hit System ──────────────────────────────────────

function rollCritical(
  agent: AgentBattleState,
  combo: ComboState,
  battleState: V2BattleState
): boolean {
  // Only offensive actions can crit
  const critRate = calculateCritRate(agent, combo, battleState);
  return Math.random() < critRate;
}

export function calculateCritRate(
  agent: AgentBattleState,
  combo: ComboState,
  battleState: V2BattleState
): number {
  const synergy = getCombinedSynergyBonuses(
    Object.keys(battleState.agentStates) as AgentId[]
  );

  let rate = C.CRIT_BASE_RATE;

  // + instinct/500
  rate += (agent.abilities.instinct + synergy.instinctBonus) / 500;

  // + VS dominance bonus (VS > 85)
  if (battleState.vsMeter.value > 85) rate += 0.08;

  // + combo bonus (combo >= 5)
  if (combo.count >= COMBO_THRESHOLDS.MAX_BONUS) rate += 0.05;

  // + synergy crit bonus
  rate += synergy.critBonus;

  // + finding accuracy bonus
  if (agent.findingValidated === true) rate += 0.033;

  // + spec bonus crit rate from agent config
  const configAgent = battleState.config.agents.find(a => a.agentId === agent.agentId);
  if (configAgent) rate += configAgent.specBonuses.critBonus;

  // Clamp
  return Math.max(C.CRIT_MIN_RATE, Math.min(C.CRIT_MAX_RATE, rate));
}

// ── 5. VS Meter ─────────────────────────────────────────────────

/**
 * Apply agent action effects to the VS meter.
 * Positive effects push VS toward 100 (user winning).
 * Negative effects (market attacks) push toward 0.
 */
export function applyToVSMeter(
  vs: VSMeterState,
  agentResults: BattleActionResult[],
  tick: ClassifiedTick,
  _battleState: V2BattleState
): VSMeterState {
  let vsChange = 0;

  // Sum up agent contributions
  for (const result of agentResults) {
    if (result.action === 'SHIELD') {
      // Shield doesn't add to VS, but prevents loss
      continue;
    }
    if (result.action === 'IDLE' || result.action === 'RECOVER') {
      continue;
    }
    vsChange += result.finalEffect;
  }

  // Market counter-attack on unfavorable ticks
  if (tick.tickClass === 'UNFAVORABLE' || tick.tickClass === 'STRONG_UNFAVORABLE') {
    const marketAttack = tick.tickClass === 'STRONG_UNFAVORABLE' ? 6.0 : 3.0;

    // Check for SHIELD absorption
    const shieldAgents = agentResults.filter(r => r.action === 'SHIELD');
    const totalAbsorption = shieldAgents.reduce((sum, s) => {
      return sum + s.baseEffect * s.statMult * s.weightMult;
    }, 0);

    // Shield absorbs percentage of market attack
    const absorbed = marketAttack * Math.min(totalAbsorption, 0.85);
    const netMarketDamage = marketAttack - absorbed;
    vsChange -= netMarketDamage;
  }

  // Neutral ticks: slight drift toward 50
  if (tick.tickClass === 'NEUTRAL') {
    const driftToCenter = (50 - vs.value) * 0.02;
    vsChange += driftToCenter;
  }

  const newValue = Math.max(C.VS_MIN, Math.min(C.VS_MAX, vs.value + vsChange));

  return {
    ...vs,
    value: newValue,
    history: [...vs.history, newValue],
  };
}

// ── 6. Effective TP/SL Adjustment ───────────────────────────────

/**
 * Calculate effective TP distance adjusted by VS meter.
 * Higher VS = TP feels closer (easier to hit).
 */
export function calculateEffectiveTP(
  originalTPDistance: number,
  vsMeterValue: number
): number {
  // effectiveTP = originalTP × (1 + (vsMeter - 50) / 200)
  // VS=75: TP 12.5% closer. VS=25: TP 12.5% further.
  const adjustment = 1 + (vsMeterValue - C.VS_NEUTRAL) / C.VS_TP_ADJUST_DIVISOR;
  return originalTPDistance * adjustment;
}

/**
 * Calculate effective SL distance adjusted by VS meter + defense agents.
 * Higher VS = SL feels further (harder to hit, more room).
 */
export function calculateEffectiveSL(
  originalSLDistance: number,
  vsMeterValue: number,
  slShieldBonus: number
): number {
  // effectiveSL = originalSL × (1 - (vsMeter - 50) / 400)
  // VS=75: SL 6.25% further. VS=25: SL 6.25% closer.
  const vsAdjustment = 1 - (vsMeterValue - C.VS_NEUTRAL) / C.VS_SL_ADJUST_DIVISOR;
  return originalSLDistance * vsAdjustment + slShieldBonus;
}

/**
 * Calculate SL shield bonus from defense agents.
 * slShieldBonus = sum(agent.accuracy × weight / 10000) for defense agents
 */
export function calculateSLShieldBonus(agents: V2BattleAgent[]): number {
  return agents
    .filter(a => a.role === 'DEFENSE')
    .reduce((sum, a) => sum + (a.abilities.accuracy * a.weight / 10000), 0);
}

// ── 7. Energy System ────────────────────────────────────────────

/**
 * Update agent energy after action + passive regen.
 */
export function updateEnergy(
  agent: AgentBattleState,
  actionCost: number,
  synergyBonuses: SynergyBonuses
): AgentBattleState {
  let energy = agent.energy - actionCost;

  // Passive regen: base + speed-scaled
  const speedRegen = agent.abilities.speed * 0.02;
  const passiveRegen = C.ENERGY_REGEN_BASE + speedRegen + synergyBonuses.energyRegenBonus;

  // RECOVER action: additional regen
  if (agent.currentAction === 'RECOVER') {
    energy += ACTION_BASE_EFFECT.RECOVER; // +8
  }

  energy = Math.min(agent.maxEnergy, energy + passiveRegen);

  // Check exhaustion
  let isExhausted = agent.isExhausted;
  let exhaustedTicksLeft = agent.exhaustedTicksLeft;

  if (energy <= 0) {
    energy = 0;
    if (!isExhausted) {
      isExhausted = true;
      exhaustedTicksLeft = C.EXHAUSTED_TICKS;
    }
  }

  if (isExhausted) {
    exhaustedTicksLeft = Math.max(0, exhaustedTicksLeft - 1);
    if (exhaustedTicksLeft <= 0) {
      isExhausted = false;
      energy = Math.max(energy, 15); // minimum recovery
    }
  }

  return {
    ...agent,
    energy,
    isExhausted,
    exhaustedTicksLeft,
  };
}

// ── 8. Combo System ─────────────────────────────────────────────

/**
 * Update combo state based on tick and actions.
 */
export function updateCombo(
  combo: ComboState,
  tick: ClassifiedTick,
  agentResults: BattleActionResult[],
  synergyBonuses: SynergyBonuses
): ComboState {
  let count = combo.count;

  if (tick.isFavorable) {
    // Check if any agent performed an offensive action
    const hasOffensiveAction = agentResults.some(r =>
      r.action === 'DASH' || r.action === 'BURST' || r.action === 'FINISHER'
    );
    if (hasOffensiveAction) {
      count++;
      // Synergy combo build bonus
      if (synergyBonuses.comboBuildBonus > 0 && Math.random() < synergyBonuses.comboBuildBonus) {
        count++; // Extra combo point from synergy
      }
      // Critical hits add +2 to combo
      const hasCrit = agentResults.some(r => r.isCritical);
      if (hasCrit) {
        count += C.CRIT_COMBO_BONUS;
      }
    }
  } else if (tick.tickClass === 'UNFAVORABLE' || tick.tickClass === 'STRONG_UNFAVORABLE') {
    // Check if SHIELD is protecting the combo
    const hasShield = agentResults.some(r => r.action === 'SHIELD');
    if (hasShield) {
      // Combo is protected! Don't increase, but don't reset either.
      // (SHIELD protects combos from unfavorable ticks)
    } else {
      // Combo breaks
      count = 0;
    }
  }
  // NEUTRAL ticks: combo unchanged

  return {
    count,
    maxCombo: Math.max(combo.maxCombo, count),
    isProtected: agentResults.some(r => r.action === 'SHIELD'),
    lastBreakTick: count === 0 && combo.count > 0 ? tick.tickN : combo.lastBreakTick,
  };
}

// ── 9. Finding Validation ───────────────────────────────────────

/**
 * Validate agent findings against actual price movement in first N ticks.
 */
export function validateFindings(
  agents: Record<string, AgentBattleState>,
  findingDirections: Record<string, Direction>,
  priceHistory: Array<{ tick: number; price: number }>,
  tickN: number
): Record<string, AgentBattleState> {
  if (tickN !== C.FINDING_VALIDATE_TICKS) return agents;

  const updated = { ...agents };
  const entryPrice = priceHistory[0]?.price ?? 0;
  const currentPrice = priceHistory[priceHistory.length - 1]?.price ?? 0;
  const actualDir: Direction = currentPrice > entryPrice ? 'LONG' :
    currentPrice < entryPrice ? 'SHORT' : 'NEUTRAL';

  for (const [agentId, state] of Object.entries(updated)) {
    const findingDir = findingDirections[agentId];
    if (!findingDir || findingDir === 'NEUTRAL') {
      updated[agentId] = { ...state, findingValidated: null, findingBuff: 0 };
      continue;
    }

    const validated = findingDir === actualDir;
    updated[agentId] = {
      ...state,
      findingValidated: validated,
      findingBuff: validated ? C.FINDING_VALIDATED_BUFF : C.FINDING_CHALLENGED_DEBUFF,
    };
  }

  return updated;
}

// ── 10. Battle Initialization ───────────────────────────────────

/**
 * Create the initial V2BattleState from config.
 */
export function initBattle(config: V2BattleConfig): V2BattleState {
  // Initialize agent states
  const agentStates: Record<string, AgentBattleState> = {};
  for (const agent of config.agents) {
    agentStates[agent.agentId] = {
      agentId: agent.agentId,
      role: agent.role,
      weight: agent.weight,
      abilities: { ...agent.abilities },
      energy: C.START_ENERGY,
      maxEnergy: C.MAX_ENERGY,
      isExhausted: false,
      exhaustedTicksLeft: 0,
      currentAction: 'IDLE',
      animState: 'IDLE',
      assistBuffActive: false,
      assistBuffMult: 0,
      tauntDebuffActive: false,
      findingValidated: null,
      findingBuff: 0,
      totalDamageDealt: 0,
      totalDamageBlocked: 0,
      actionsPerformed: 0,
      criticalHits: 0,
    };
  }

  // Calculate analysis-phase buffs
  const councilBuff =
    config.councilConsensus === 'unanimous' ? C.COUNCIL_UNANIMOUS_BUFF :
    config.councilConsensus === 'majority' ? C.COUNCIL_MAJORITY_BUFF :
    C.COUNCIL_SPLIT_DEBUFF;

  const hypothesisRRBuff =
    config.hypothesisRR >= 3.0 ? C.RR_GREAT_BUFF :
    config.hypothesisRR >= 2.0 ? C.RR_GOOD_BUFF :
    config.hypothesisRR < 1.5 ? C.RR_BAD_DEBUFF : 0;

  // SL shield bonus from defense agents
  const slShieldBonus = calculateSLShieldBonus(config.agents);

  return {
    config,

    tickN: 0,
    maxTicks: config.tierTickCount,
    tickIntervalMs: C.TICK_INTERVAL_MS,
    battleStartTime: Date.now(),
    lastTickTime: Date.now(),

    currentPrice: config.entryPrice,
    priceHistory: [{ tick: 0, price: config.entryPrice }],

    vsMeter: {
      value: config.tierVSStart,
      startValue: config.tierVSStart,
      history: [config.tierVSStart],
    },

    effectiveTPDistance: Math.abs(config.tpPrice - config.entryPrice),
    effectiveSLDistance: Math.abs(config.slPrice - config.entryPrice),
    slShieldBonus,

    agentStates,

    combo: {
      count: 0,
      maxCombo: 0,
      isProtected: false,
      lastBreakTick: -1,
    },

    critical: {
      baseCritRate: C.CRIT_BASE_RATE,
      currentCritRate: C.CRIT_BASE_RATE,
      totalCrits: 0,
    },

    playerActions: {
      tacticalFocusUsesLeft: 2,
      emergencyRecallUsesLeft: 1,
      tacticalFocusCooldownTick: -1,
      activeFocusAgentId: null,
      activeFocusTicksLeft: 0,
    },

    log: [{
      tickN: 0,
      timestamp: Date.now(),
      type: 'system',
      message: 'BATTLE STATIONS! Round 1 begins!',
      color: '#F0EDE4',
      icon: '⚔',
    }],
    milestones: [],
    tickResults: [],

    status: 'running',
    result: null,

    councilBuff,
    hypothesisRRBuff,
  };
}

// ── 11. Process Tick (CORE PIPELINE) ────────────────────────────

/**
 * Process a single battle tick. This is the main game loop function.
 * Called every 1.5 seconds with the latest BTC price.
 */
export function processTick(
  state: V2BattleState,
  newPrice: number
): V2BattleState {
  if (state.status !== 'running') return state;

  const tickN = state.tickN + 1;
  const prevPrice = state.currentPrice;

  // ── Step 1: Classify the tick ──
  const classifiedTick = classifyTick(
    tickN,
    prevPrice,
    newPrice,
    state.config.atr1m,
    state.config.direction
  );

  // ── Step 2: Get synergy bonuses ──
  const agentIds = Object.keys(state.agentStates) as AgentId[];
  const synergyBonuses = getCombinedSynergyBonuses(agentIds);

  // ── Step 3: Select + calculate actions for each agent ──
  const agentResults: BattleActionResult[] = [];
  let updatedAgents = { ...state.agentStates };

  // Process assist buffs from previous tick
  for (const [id, agentState] of Object.entries(updatedAgents)) {
    // Clear expired assist buffs
    if (agentState.assistBuffActive) {
      updatedAgents[id] = {
        ...agentState,
        assistBuffActive: false,
        assistBuffMult: 0,
      };
    }
  }

  // Select and calculate actions
  for (const agentId of agentIds) {
    const agent = updatedAgents[agentId];
    const action = selectAction(agent, classifiedTick, state.combo, synergyBonuses, state);
    const result = calculateActionEffect(agent, action, classifiedTick, state.combo, synergyBonuses, state);
    agentResults.push(result);

    // Update agent state
    const updatedAgent = updateEnergy(
      { ...agent, currentAction: action, animState: result.animState, actionsPerformed: agent.actionsPerformed + 1 },
      result.energyCost,
      synergyBonuses
    );

    // Track damage/blocked
    if (action === 'SHIELD') {
      updatedAgents[agentId] = {
        ...updatedAgent,
        totalDamageBlocked: updatedAgent.totalDamageBlocked + result.finalEffect,
      };
    } else if (result.finalEffect > 0 && action !== 'IDLE' && action !== 'RECOVER') {
      updatedAgents[agentId] = {
        ...updatedAgent,
        totalDamageDealt: updatedAgent.totalDamageDealt + result.finalEffect,
        criticalHits: updatedAgent.criticalHits + (result.isCritical ? 1 : 0),
      };
    } else {
      updatedAgents[agentId] = updatedAgent;
    }

    // Handle ASSIST: buff the next agent's action
    if (action === 'ASSIST') {
      // Find next agent in order and buff them
      const nextIdx = agentIds.indexOf(agentId) + 1;
      const nextId = agentIds[nextIdx % agentIds.length];
      if (nextId && updatedAgents[nextId]) {
        updatedAgents[nextId] = {
          ...updatedAgents[nextId],
          assistBuffActive: true,
          assistBuffMult: ACTION_BASE_EFFECT.ASSIST,
        };
      }
    }
  }

  // ── Step 4: Update VS Meter ──
  const newVS = applyToVSMeter(state.vsMeter, agentResults, classifiedTick, state);

  // ── Step 5: Update Combo ──
  const newCombo = updateCombo(state.combo, classifiedTick, agentResults, synergyBonuses);

  // ── Step 6: Validate findings (on tick 4) ──
  const newPriceHistory = [...state.priceHistory, { tick: tickN, price: newPrice }];
  if (tickN === C.FINDING_VALIDATE_TICKS) {
    updatedAgents = validateFindings(
      updatedAgents,
      state.config.findingDirections as Record<string, Direction>,
      newPriceHistory,
      tickN
    );
  }

  // ── Step 7: Update effective TP/SL ──
  const origTPDist = Math.abs(state.config.tpPrice - state.config.entryPrice);
  const origSLDist = Math.abs(state.config.slPrice - state.config.entryPrice);
  const effectiveTPDistance = calculateEffectiveTP(origTPDist, newVS.value);
  const effectiveSLDistance = calculateEffectiveSL(origSLDist, newVS.value, state.slShieldBonus);

  // ── Step 8: Update player action state ──
  let playerActions = { ...state.playerActions };
  if (playerActions.activeFocusTicksLeft > 0) {
    playerActions = {
      ...playerActions,
      activeFocusTicksLeft: playerActions.activeFocusTicksLeft - 1,
      activeFocusAgentId: playerActions.activeFocusTicksLeft <= 1 ? null : playerActions.activeFocusAgentId,
    };
  }

  // ── Step 9: Generate milestones ──
  const milestones = generateMilestones(
    tickN, classifiedTick, newCombo, state.combo,
    newVS.value, agentResults, updatedAgents,
    effectiveTPDistance, effectiveSLDistance,
    newPrice, state.config
  );

  // ── Step 10: Generate battle log entries ──
  const logEntries = generateLogEntries(tickN, classifiedTick, agentResults, newCombo, milestones);

  // ── Step 11: Check battle end ──
  let status: V2BattleState['status'] = state.status;
  let result: V2BattleState['result'] = state.result;

  // Check if max ticks reached
  if (tickN >= state.maxTicks) {
    status = 'finished';
    const pnl = calculatePnLPercent(state.config.entryPrice, newPrice, state.config.direction);
    result = generateBattleResult(
      pnl >= 0 ? 'timeout_win' : 'timeout_loss',
      newVS.value, pnl, newCombo.maxCombo, tickN,
      state.critical.totalCrits + agentResults.filter(r => r.isCritical).length,
      updatedAgents
    );
  }

  // Check effective TP/SL hit
  if (status === 'running') {
    const pnl = calculatePnLPercent(state.config.entryPrice, newPrice, state.config.direction);
    const pnlAbs = Math.abs(pnl);
    const tpPct = (Math.abs(state.config.tpPrice - state.config.entryPrice) / state.config.entryPrice) * 100;
    const slPct = (Math.abs(state.config.slPrice - state.config.entryPrice) / state.config.entryPrice) * 100;

    // VS-adjusted distances
    const adjustedTPPct = tpPct * (1 - (newVS.value - 50) / 200); // adjusted threshold
    const adjustedSLPct = slPct * (1 + (newVS.value - 50) / 400); // adjusted threshold

    if (pnl >= 0 && pnlAbs >= adjustedTPPct) {
      status = 'finished';
      result = generateBattleResult(
        'tp_hit', newVS.value, pnl, newCombo.maxCombo, tickN,
        state.critical.totalCrits + agentResults.filter(r => r.isCritical).length,
        updatedAgents
      );
    } else if (pnl < 0 && pnlAbs >= adjustedSLPct) {
      status = 'finished';
      result = generateBattleResult(
        'sl_hit', newVS.value, pnl, newCombo.maxCombo, tickN,
        state.critical.totalCrits + agentResults.filter(r => r.isCritical).length,
        updatedAgents
      );
    }
  }

  // ── Build tick result ──
  const tickResult: TickResult = {
    tickN,
    classifiedTick,
    agentActions: agentResults,
    vsChange: newVS.value - state.vsMeter.value,
    vsBefore: state.vsMeter.value,
    vsAfter: newVS.value,
    comboBefore: state.combo.count,
    comboAfter: newCombo.count,
    milestones,
    logEntries,
  };

  return {
    ...state,
    tickN,
    lastTickTime: Date.now(),
    currentPrice: newPrice,
    priceHistory: newPriceHistory,
    vsMeter: newVS,
    effectiveTPDistance,
    effectiveSLDistance,
    agentStates: updatedAgents,
    combo: newCombo,
    critical: {
      ...state.critical,
      totalCrits: state.critical.totalCrits + agentResults.filter(r => r.isCritical).length,
    },
    playerActions,
    log: [...state.log, ...logEntries],
    milestones: [...state.milestones, ...milestones],
    tickResults: [...state.tickResults, tickResult],
    status,
    result,
  };
}

// ── 12. Player Actions ──────────────────────────────────────────

/**
 * Apply a player's tactical action during battle.
 */
export function applyPlayerAction(
  state: V2BattleState,
  actionType: PlayerActionType,
  targetAgentId: AgentId
): V2BattleState {
  if (state.status !== 'running') return state;

  let playerActions = { ...state.playerActions };
  let agentStates = { ...state.agentStates };
  const newLog: BattleLogEntry[] = [];

  switch (actionType) {
    case 'TACTICAL_FOCUS': {
      if (playerActions.tacticalFocusUsesLeft <= 0) return state;
      if (playerActions.tacticalFocusCooldownTick >= state.tickN) return state;

      playerActions = {
        ...playerActions,
        tacticalFocusUsesLeft: playerActions.tacticalFocusUsesLeft - 1,
        tacticalFocusCooldownTick: state.tickN + C.TACTICAL_FOCUS_COOLDOWN,
        activeFocusAgentId: targetAgentId,
        activeFocusTicksLeft: C.TACTICAL_FOCUS_DURATION,
      };

      newLog.push({
        tickN: state.tickN,
        timestamp: Date.now(),
        type: 'system',
        message: `TACTICAL FOCUS on ${targetAgentId}! +40% for 3 actions!`,
        color: '#FFD700',
        icon: '🎯',
      });
      break;
    }

    case 'EMERGENCY_RECALL': {
      if (playerActions.emergencyRecallUsesLeft <= 0) return state;

      playerActions = {
        ...playerActions,
        emergencyRecallUsesLeft: 0,
      };

      // Instant energy recovery for target
      const target = agentStates[targetAgentId];
      if (target) {
        agentStates[targetAgentId] = {
          ...target,
          energy: Math.min(target.maxEnergy, target.energy + C.EMERGENCY_RECALL_ENERGY),
          isExhausted: false,
          exhaustedTicksLeft: 0,
          animState: 'RECOVER',
        };
      }

      newLog.push({
        tickN: state.tickN,
        timestamp: Date.now(),
        type: 'system',
        message: `EMERGENCY RECALL! ${targetAgentId} recovers +${C.EMERGENCY_RECALL_ENERGY} energy! Team braces!`,
        color: '#FF6B6B',
        icon: '🚨',
      });
      break;
    }
  }

  return {
    ...state,
    playerActions,
    agentStates,
    log: [...state.log, ...newLog],
  };
}

// ── 13. Milestone Generation ────────────────────────────────────

function generateMilestones(
  tickN: number,
  tick: ClassifiedTick,
  newCombo: ComboState,
  prevCombo: ComboState,
  vsValue: number,
  agentResults: BattleActionResult[],
  agents: Record<string, AgentBattleState>,
  effectiveTPDist: number,
  effectiveSLDist: number,
  currentPrice: number,
  config: V2BattleConfig
): BattleMilestone[] {
  const milestones: BattleMilestone[] = [];

  // Combo milestones
  if (newCombo.count >= COMBO_THRESHOLDS.QUAD && prevCombo.count < COMBO_THRESHOLDS.QUAD) {
    milestones.push({
      tickN, type: 'COMBO_QUAD',
      detail: `4-HIT COMBO! FINISHER unlocked!`,
      screenShakeIntensity: SCREEN_SHAKE_TABLE.combo_4.px,
      screenShakeDuration: SCREEN_SHAKE_TABLE.combo_4.ms,
    });
  } else if (newCombo.count >= COMBO_THRESHOLDS.TRIPLE && prevCombo.count < COMBO_THRESHOLDS.TRIPLE) {
    milestones.push({
      tickN, type: 'COMBO_TRIPLE',
      detail: `3-HIT COMBO! Synchronized attack!`,
      screenShakeIntensity: SCREEN_SHAKE_TABLE.combo_3.px,
      screenShakeDuration: SCREEN_SHAKE_TABLE.combo_3.ms,
    });
  } else if (newCombo.count >= COMBO_THRESHOLDS.DOUBLE && prevCombo.count < COMBO_THRESHOLDS.DOUBLE) {
    milestones.push({
      tickN, type: 'COMBO_DOUBLE',
      detail: `2-HIT COMBO!`,
      screenShakeIntensity: SCREEN_SHAKE_TABLE.combo_2.px,
      screenShakeDuration: SCREEN_SHAKE_TABLE.combo_2.ms,
    });
  }

  // Critical hit milestone
  for (const r of agentResults) {
    if (r.isCritical) {
      milestones.push({
        tickN, type: 'CRITICAL_HIT',
        detail: `CRITICAL! ${r.agentId} deals ${r.damageNumber?.toFixed(1)} damage!`,
        agentId: r.agentId,
        screenShakeIntensity: SCREEN_SHAKE_TABLE.critical.px,
        screenShakeDuration: SCREEN_SHAKE_TABLE.critical.ms,
      });
    }
  }

  // TP/SL proximity
  const pnl = calculatePnLPercent(config.entryPrice, currentPrice, config.direction);
  const tpPct = (Math.abs(config.tpPrice - config.entryPrice) / config.entryPrice) * 100;
  const slPct = (Math.abs(config.slPrice - config.entryPrice) / config.entryPrice) * 100;

  if (pnl > 0 && tpPct > 0 && (pnl / tpPct) >= 0.80) {
    milestones.push({
      tickN, type: 'APPROACHING_TP',
      detail: 'APPROACHING TARGET!',
      screenShakeIntensity: 3,
      screenShakeDuration: 200,
    });
  }

  if (pnl < 0 && slPct > 0 && (Math.abs(pnl) / slPct) >= 0.80) {
    milestones.push({
      tickN, type: 'DANGER_ZONE',
      detail: 'DANGER ZONE!',
      screenShakeIntensity: 4,
      screenShakeDuration: 300,
    });
  }

  // Exhaustion
  for (const [agentId, agentState] of Object.entries(agents)) {
    if (agentState.isExhausted && agentState.exhaustedTicksLeft === C.EXHAUSTED_TICKS) {
      milestones.push({
        tickN, type: 'EXHAUSTED',
        detail: `${agentId} is EXHAUSTED! Forced idle for ${C.EXHAUSTED_TICKS} ticks!`,
        agentId: agentId as AgentId,
        screenShakeIntensity: 2,
        screenShakeDuration: 100,
      });
    }
  }

  // Finding validation (tick 4)
  if (tickN === C.FINDING_VALIDATE_TICKS) {
    for (const [agentId, agentState] of Object.entries(agents)) {
      if (agentState.findingValidated === true) {
        milestones.push({
          tickN, type: 'FINDING_VALIDATED',
          detail: `${agentId}'s finding VALIDATED! +15% all actions!`,
          agentId: agentId as AgentId,
          screenShakeIntensity: 3,
          screenShakeDuration: 200,
        });
      } else if (agentState.findingValidated === false) {
        milestones.push({
          tickN, type: 'FINDING_CHALLENGED',
          detail: `${agentId}'s finding CHALLENGED! -10% all actions.`,
          agentId: agentId as AgentId,
          screenShakeIntensity: 2,
          screenShakeDuration: 150,
        });
      }
    }
  }

  // Finisher
  if (agentResults.some(r => r.action === 'FINISHER')) {
    milestones.push({
      tickN, type: 'FINISHER_READY',
      detail: 'FINISHER ACTIVATED!',
      screenShakeIntensity: SCREEN_SHAKE_TABLE.finisher.px,
      screenShakeDuration: SCREEN_SHAKE_TABLE.finisher.ms,
    });
  }

  return milestones;
}

// ── 14. Battle Log Generation ───────────────────────────────────

function generateLogEntries(
  tickN: number,
  tick: ClassifiedTick,
  agentResults: BattleActionResult[],
  combo: ComboState,
  milestones: BattleMilestone[]
): BattleLogEntry[] {
  const entries: BattleLogEntry[] = [];
  const ts = Date.now();

  // Agent action entries
  for (const r of agentResults) {
    if (r.action === 'IDLE') continue;

    let msg = '';
    const critPrefix = r.isCritical ? 'CRITICAL! ' : '';

    switch (r.action) {
      case 'DASH':
        msg = `${critPrefix}${r.agentId} dashes! +${r.damageNumber?.toFixed(1)} VS`;
        break;
      case 'BURST':
        msg = `${critPrefix}${r.agentId} BURSTS! +${r.damageNumber?.toFixed(1)} VS`;
        break;
      case 'FINISHER':
        msg = `${critPrefix}${r.agentId} FINISHER! +${r.damageNumber?.toFixed(1)} VS`;
        break;
      case 'SHIELD':
        msg = `${r.agentId} raises SHIELD!`;
        break;
      case 'PING':
        msg = `${r.agentId} scouts ahead`;
        break;
      case 'HOOK':
        msg = `${r.agentId} hooks! Pulling VS center`;
        break;
      case 'ASSIST':
        msg = `${r.agentId} ASSISTS! Next agent +40%`;
        break;
      case 'TAUNT':
        msg = `${r.agentId} TAUNTS the market!`;
        break;
      case 'RECOVER':
        msg = `${r.agentId} recovers energy`;
        break;
    }

    if (msg) {
      entries.push({
        tickN, timestamp: ts,
        type: r.isCritical ? 'critical' : 'action',
        message: msg,
        color: tick.isFavorable ? '#00ff88' : (tick.tickClass === 'NEUTRAL' ? '#F0EDE4' : '#ff2d55'),
        icon: r.isCritical ? '💥' : undefined,
      });
    }
  }

  // Market attack on unfavorable ticks
  if (tick.tickClass === 'UNFAVORABLE' || tick.tickClass === 'STRONG_UNFAVORABLE') {
    const intensity = tick.tickClass === 'STRONG_UNFAVORABLE' ? 'STRIKES HARD' : 'strikes';
    entries.push({
      tickN, timestamp: ts,
      type: 'action',
      message: `MARKET ${intensity}! ${tick.deltaPct > 0 ? '+' : ''}${tick.deltaPct.toFixed(3)}%`,
      color: '#ff2d55',
      icon: '⚡',
    });
  }

  // Combo entry
  if (combo.count >= COMBO_THRESHOLDS.DOUBLE) {
    entries.push({
      tickN, timestamp: ts,
      type: 'combo',
      message: `${combo.count}-HIT COMBO!`,
      color: '#FFD700',
      icon: '🔥',
    });
  }

  // Milestone entries
  for (const ms of milestones) {
    if (ms.type === 'APPROACHING_TP') {
      entries.push({
        tickN, timestamp: ts,
        type: 'milestone',
        message: 'APPROACHING TARGET!',
        color: '#FFD700',
        icon: '🎯',
      });
    } else if (ms.type === 'DANGER_ZONE') {
      entries.push({
        tickN, timestamp: ts,
        type: 'milestone',
        message: 'DANGER ZONE!',
        color: '#ff2d55',
        icon: '⚠',
      });
    }
  }

  return entries;
}

// ── 15. Speech Bubbles ──────────────────────────────────────────

const SPEECH_TEMPLATES: Record<string, Record<string, string[]>> = {
  STRUCTURE: {
    favorable: ['such pattern. candles speak truth!', 'the structure holds!', 'chart go brrr!'],
    unfavorable: ['structure bending... not broken yet', 'support being tested. much concern'],
    critical: ['THE PATTERN HOLDS! SUCH PREDICTION! WOW!'],
    combo: ['momentum confirmed!', 'trend is our fren!'],
  },
  VPA: {
    favorable: ['volume confirms! much proof!', 'buyers stepping in. wow'],
    unfavorable: ['volume diverging... careful', 'sellers appearing. such warning'],
    critical: ['VOLUME EXPLOSION! CALLED IT!'],
    combo: ['volume + price = unstoppable!'],
  },
  ICT: {
    favorable: ['smart money moves in silence... and profit', 'liquidity swept. as planned'],
    unfavorable: ['they\'re hunting our stops...', 'institutional pressure detected'],
    critical: ['THE SMART MONEY TRAP WORKED!'],
    combo: ['order flow aligned perfectly'],
  },
  DERIV: {
    favorable: ['futures say we\'re right. much hedge', 'OI supports our position'],
    unfavorable: ['funding rate shifting against us...', 'protect the position!'],
    critical: ['DERIVATIVES CONFIRM! SHIELD HOLDING!'],
    combo: ['perp basis looking good!'],
  },
  VALUATION: {
    favorable: ['on-chain truth endures. very patient', 'fundamentals backing us up'],
    unfavorable: ['valuation stretched... exercise caution', 'NVT sending warning'],
    critical: ['ON-CHAIN METRICS VALIDATED!'],
    combo: ['fair value zone confirmed'],
  },
  FLOW: {
    favorable: ['whale spotted!! much big!! buying!', 'capital flowing in!'],
    unfavorable: ['whale selling!! much concern!', 'outflow detected!'],
    critical: ['MASSIVE WHALE BUY! CALLED IT!'],
    combo: ['flow momentum unstoppable!'],
  },
  SENTI: {
    favorable: ['the vibes... much positive! wow', 'crowd sentiment shifting bullish'],
    unfavorable: ['fear rising... the vibes are bad', 'sentiment deteriorating'],
    critical: ['TOLD YOU THE VIBES WERE RIGHT!'],
    combo: ['sentiment + price aligned!'],
  },
  MACRO: {
    favorable: ['the global picture unfolds in our favor', 'macro winds at our back'],
    unfavorable: ['macro headwinds intensifying', 'global risk-off mode engaging'],
    critical: ['MACRO THESIS CONFIRMED!'],
    combo: ['all timeframes aligned!'],
  },
};

function getSpeechBubble(
  agent: AgentBattleState,
  action: ActionType,
  tick: ClassifiedTick,
  isCritical: boolean
): string | null {
  // Only show speech ~30% of the time to avoid spam
  if (Math.random() > 0.30) return null;
  // Always show on critical
  if (isCritical) {
    const templates = SPEECH_TEMPLATES[agent.agentId]?.critical ?? ['WOW!'];
    return templates[Math.floor(Math.random() * templates.length)];
  }

  const category = tick.isFavorable ? 'favorable' : 'unfavorable';
  const templates = SPEECH_TEMPLATES[agent.agentId]?.[category] ?? [];
  if (templates.length === 0) return null;

  return templates[Math.floor(Math.random() * templates.length)];
}

// ── 16. Utility Functions ───────────────────────────────────────

function calculatePnLPercent(entry: number, current: number, dir: Direction): number {
  if (entry <= 0) return 0;
  return dir === 'LONG'
    ? ((current - entry) / entry) * 100
    : ((entry - current) / entry) * 100;
}

function generateBattleResult(
  outcome: V2BattleResult['outcome'],
  finalVS: number,
  finalPnL: number,
  maxCombo: number,
  totalTicks: number,
  totalCrits: number,
  agents: Record<string, AgentBattleState>
): V2BattleResult {
  // Generate per-agent reports
  const agentReports: AgentBattleReport[] = Object.values(agents).map(agent => {
    const energySpent = (C.START_ENERGY - agent.energy) +
      (agent.actionsPerformed * 10); // rough estimate
    const efficiency = energySpent > 0 ? agent.totalDamageDealt / energySpent : 0;

    return {
      agentId: agent.agentId,
      totalDamage: agent.totalDamageDealt,
      totalBlocked: agent.totalDamageBlocked,
      actionsPerformed: agent.actionsPerformed,
      criticalHits: agent.criticalHits,
      findingValidated: agent.findingValidated,
      energyEfficiency: efficiency,
      mvpScore: agent.totalDamageDealt + agent.totalDamageBlocked * 0.5 +
        agent.criticalHits * 5 + (agent.findingValidated ? 10 : 0),
    };
  });

  // Find MVP
  const mvp = agentReports.reduce((best, r) =>
    r.mvpScore > best.mvpScore ? r : best
  );

  return {
    outcome,
    finalVS,
    finalPnL,
    maxCombo,
    totalTicks,
    totalCrits,
    agentMVP: mvp.agentId,
    agentReports,
  };
}

// ── 17. Exports for UI ──────────────────────────────────────────

/**
 * Get a human-readable summary of the current battle state.
 */
export function getBattleSummary(state: V2BattleState): {
  tickN: number;
  maxTicks: number;
  vs: number;
  combo: number;
  maxCombo: number;
  pnl: number;
  status: string;
  agentEnergies: Record<string, number>;
  latestMilestone: string | null;
} {
  const pnl = calculatePnLPercent(
    state.config.entryPrice,
    state.currentPrice,
    state.config.direction
  );

  const agentEnergies: Record<string, number> = {};
  for (const [id, agent] of Object.entries(state.agentStates)) {
    agentEnergies[id] = agent.energy;
  }

  const latestMilestone = state.milestones.length > 0
    ? state.milestones[state.milestones.length - 1].detail
    : null;

  return {
    tickN: state.tickN,
    maxTicks: state.maxTicks,
    vs: state.vsMeter.value,
    combo: state.combo.count,
    maxCombo: state.combo.maxCombo,
    pnl,
    status: state.status,
    agentEnergies,
    latestMilestone,
  };
}

// =================================================================
// WTD Arena v3 — Battle Engine
// =================================================================
// v2BattleEngine 위에 HP + 차트 리딩 챌린지 래핑
// v2는 canonical — processTick() 그대로 호출 후 HP 변환
// =================================================================

import type { AgentId, Direction } from './types';
import type { AgentType, AgentTier, TYPE_EFFECTIVENESS } from './agentCharacter';
import { getAgentCharacter, getTierForLevel } from './agentCharacter';
import type {
  V2BattleState,
  ClassifiedTick,
  TickResult,
  TickClass,
} from './v2BattleTypes';
import {
  initBattle as v2InitBattle,
  processTick as v2ProcessTick,
  classifyTick,
} from './v2BattleEngine';
import type {
  V3BattleState,
  V3AgentState,
  V3TickResult,
  V3BattleInitConfig,
  ChartChallenge,
  ChallengeType,
  ChallengeBonus,
  HPChange,
  KOEvent,
} from './v3BattleTypes';
import {
  HP_CONFIG,
  SWITCH_CONFIG,
  CHALLENGE_CONFIG,
} from './v3BattleTypes';
import { TYPE_EFFECTIVENESS as TYPE_EFF } from './agentCharacter';

// ── HP Calculation ─────────────────────────────────────────────

/**
 * Calculate max HP for an agent.
 * maxHP = (60 + resilience * 1.2) * (1 + 0.02 * level) * tierBonus
 */
export function calculateMaxHP(resilience: number, level: number, tier: AgentTier): number {
  const base = HP_CONFIG.BASE_HP + resilience * HP_CONFIG.RESILIENCE_MULT;
  const levelScale = 1 + HP_CONFIG.LEVEL_SCALE_PER * level;
  const tierBonus = HP_CONFIG.TIER_BONUS[tier];
  return Math.round(base * levelScale * tierBonus);
}

/**
 * Calculate damage dealt to an agent from a market tick.
 */
export function calculateTickDamage(
  tickClass: TickClass,
  deltaMagnitude: number,
  atr: number,
  attackerType: AgentType,
  defenderType: AgentType,
  defenderAccuracy: number,
  hasShield: boolean,
  vsMeter: number,
  isCritical: boolean,
): number {
  const baseDmg = HP_CONFIG.TICK_DAMAGE[tickClass] ?? 0;
  if (baseDmg === 0) return 0;

  // Scale by ATR-relative magnitude
  const scaledDmg = baseDmg * Math.min(2.0, deltaMagnitude / Math.max(atr, 0.01));

  // Defense reduction
  const defense = defenderAccuracy * HP_CONFIG.DEFENSE_FACTOR;

  // Type effectiveness
  const typeMult = TYPE_EFF[attackerType]?.[defenderType] ?? 1.0;

  // Base final damage
  let finalDmg = Math.max(1, scaledDmg - defense) * typeMult;

  // Shield reduction
  if (hasShield) {
    finalDmg *= HP_CONFIG.SHIELD_REDUCTION;
  }

  // VS momentum buff (opponent's damage boosted when VS is low)
  if (vsMeter < HP_CONFIG.VS_LOW_THRESHOLD) {
    finalDmg *= (1 + HP_CONFIG.VS_DAMAGE_BUFF);
  }

  // Critical hit
  if (isCritical) {
    finalDmg *= 1.5;
  }

  return Math.round(finalDmg * 10) / 10;
}

/**
 * Calculate healing from a favorable tick.
 */
export function calculateTickHeal(
  tickClass: TickClass,
  synergy: number,
  vsMeter: number,
): number {
  const baseHeal = HP_CONFIG.TICK_HEAL[tickClass] ?? 0;
  if (baseHeal === 0) return 0;

  let heal = baseHeal * (1 + synergy * 0.01);

  // VS momentum buff
  if (vsMeter > HP_CONFIG.VS_HIGH_THRESHOLD) {
    heal *= (1 + HP_CONFIG.VS_HEAL_BUFF);
  }

  return Math.round(heal * 10) / 10;
}

// ── Initialization ─────────────────────────────────────────────

/**
 * Initialize v3 battle state wrapping v2.
 */
export function initV3Battle(config: V3BattleInitConfig): V3BattleState {
  // Initialize v2 state
  const v2State = v2InitBattle(config.v2Config);

  // Create v3 agent states with HP
  const humanAgents: V3AgentState[] = config.humanTeam.map((a, i) => ({
    agentId: a.agentId,
    hp: calculateMaxHP(a.resilience, a.level, a.tier),
    maxHP: calculateMaxHP(a.resilience, a.level, a.tier),
    isKO: false,
    isLead: i === 0,
    level: a.level,
    tier: a.tier,
    type: a.type,
    totalHPDamageDealt: 0,
    totalHPDamageReceived: 0,
    totalHPHealed: 0,
  }));

  const aiAgents: V3AgentState[] = config.aiTeam.map((a, i) => ({
    agentId: a.agentId,
    hp: calculateMaxHP(a.resilience, a.level, a.tier),
    maxHP: calculateMaxHP(a.resilience, a.level, a.tier),
    isKO: false,
    isLead: i === 0,
    level: a.level,
    tier: a.tier,
    type: a.type,
    totalHPDamageDealt: 0,
    totalHPDamageReceived: 0,
    totalHPHealed: 0,
  }));

  return {
    v2State,
    humanAgents,
    aiAgents,
    humanLeadIdx: 0,
    aiLeadIdx: 0,
    switchCooldown: 0,
    guardCooldown: 0,
    guardActiveTicksLeft: 0,
    challenges: [],
    activeChallenge: null,
    challengeScore: { correct: 0, wrong: 0, timeout: 0, total: 0 },
    forcedIdleTicksLeft: 0,
    v3Status: 'running',
    koEvents: [],
  };
}

// ── Core Tick Processing ───────────────────────────────────────

/**
 * Process a single v3 tick.
 * 1. Run v2 tick pipeline
 * 2. Convert v2 results to HP changes
 * 3. Check/trigger challenges
 * 4. Apply challenge results
 * 5. Check KO and team wipe
 */
export function processV3Tick(
  state: V3BattleState,
  newPrice: number,
): V3TickResult {
  if (state.v3Status !== 'running') {
    return {
      v2Result: state.v2State.tickResults[state.v2State.tickResults.length - 1],
      hpChanges: [],
      challengeTriggered: null,
      challengeResolved: null,
      koEvents: [],
      leadSwitchOccurred: false,
    };
  }

  // ── Step 1: Run v2 tick pipeline ──
  const newV2State = v2ProcessTick(state.v2State, newPrice);
  const v2Result = newV2State.tickResults[newV2State.tickResults.length - 1];

  if (!v2Result) {
    return {
      v2Result: { tickN: 0, classifiedTick: {} as ClassifiedTick, agentActions: [], vsChange: 0, vsBefore: 0, vsAfter: 0, comboBefore: 0, comboAfter: 0, milestones: [], logEntries: [] },
      hpChanges: [],
      challengeTriggered: null,
      challengeResolved: null,
      koEvents: [],
      leadSwitchOccurred: false,
    };
  }

  const tick = v2Result.classifiedTick;
  const hpChanges: HPChange[] = [];
  const koEvents: KOEvent[] = [];
  let leadSwitchOccurred = false;

  // Copy agent states for mutation
  let humanAgents = state.humanAgents.map(a => ({ ...a }));
  let aiAgents = state.aiAgents.map(a => ({ ...a }));
  let humanLeadIdx = state.humanLeadIdx;
  let aiLeadIdx = state.aiLeadIdx;

  // ── Step 2: Apply HP changes from tick ──

  // Unfavorable ticks damage human's lead agent
  if (tick.tickClass === 'UNFAVORABLE' || tick.tickClass === 'STRONG_UNFAVORABLE') {
    const humanLead = humanAgents[humanLeadIdx];
    if (humanLead && !humanLead.isKO) {
      // Determine "attacker" type from AI lead
      const aiLead = aiAgents[aiLeadIdx];
      const attackerType = aiLead?.type ?? 'TECH';

      // Check if any human agent used SHIELD
      const hasShield = v2Result.agentActions.some(a =>
        state.humanAgents.some(ha => ha.agentId === a.agentId) && a.action === 'SHIELD'
      );
      const hasCrit = v2Result.agentActions.some(a => a.isCritical);

      // Guard reduction
      let guardMult = 1.0;
      if (state.guardActiveTicksLeft > 0) {
        guardMult = SWITCH_CONFIG.GUARD_REDUCTION;
      }

      const damage = calculateTickDamage(
        tick.tickClass,
        Math.abs(tick.delta),
        tick.atrRef,
        attackerType,
        humanLead.type,
        humanLead.isLead ? (getAgentCharacter(humanLead.agentId)?.baseStats.accuracy ?? 70) : 70,
        hasShield,
        newV2State.vsMeter.value,
        hasCrit,
      ) * guardMult;

      const prevHP = humanLead.hp;
      humanLead.hp = Math.max(0, humanLead.hp - damage);
      humanLead.totalHPDamageReceived += damage;

      hpChanges.push({
        agentId: humanLead.agentId,
        side: 'human',
        previousHP: prevHP,
        damage,
        heal: 0,
        newHP: humanLead.hp,
        source: 'tick',
        typeMultiplier: TYPE_EFF[attackerType]?.[humanLead.type],
        wasCritical: hasCrit,
      });

      // Check KO
      if (humanLead.hp <= 0) {
        humanLead.isKO = true;
        humanLead.isLead = false;
        koEvents.push({
          tickN: v2Result.tickN,
          agentId: humanLead.agentId,
          side: 'human',
          killerAgentId: aiLead?.agentId,
        });

        // Auto-switch to next alive agent
        const nextAlive = humanAgents.findIndex((a, i) => i !== humanLeadIdx && !a.isKO);
        if (nextAlive !== -1) {
          humanLeadIdx = nextAlive;
          humanAgents[nextAlive].isLead = true;
          leadSwitchOccurred = true;
        }
      }
    }
  }

  // Favorable ticks also damage AI's lead agent (they're on opposite side)
  if (tick.tickClass === 'FAVORABLE' || tick.tickClass === 'STRONG_FAVORABLE') {
    const aiLead = aiAgents[aiLeadIdx];
    if (aiLead && !aiLead.isKO) {
      const humanLead = humanAgents[humanLeadIdx];
      const attackerType = humanLead?.type ?? 'TECH';

      // Flip the tick class for AI perspective
      const flippedClass = tick.tickClass === 'STRONG_FAVORABLE' ? 'STRONG_UNFAVORABLE' as TickClass : 'UNFAVORABLE' as TickClass;

      const damage = calculateTickDamage(
        flippedClass,
        Math.abs(tick.delta),
        tick.atrRef,
        attackerType,
        aiLead.type,
        getAgentCharacter(aiLead.agentId)?.baseStats.accuracy ?? 70,
        false, // AI doesn't get player SHIELD benefit
        100 - newV2State.vsMeter.value, // flip VS for AI perspective
        v2Result.agentActions.some(a => a.isCritical),
      );

      const prevHP = aiLead.hp;
      aiLead.hp = Math.max(0, aiLead.hp - damage);
      aiLead.totalHPDamageReceived += damage;

      // Track human lead's damage dealt
      if (humanLead && !humanLead.isKO) {
        humanLead.totalHPDamageDealt += damage;
      }

      hpChanges.push({
        agentId: aiLead.agentId,
        side: 'ai',
        previousHP: prevHP,
        damage,
        heal: 0,
        newHP: aiLead.hp,
        source: 'tick',
        typeMultiplier: TYPE_EFF[attackerType]?.[aiLead.type],
      });

      // Check AI KO
      if (aiLead.hp <= 0) {
        aiLead.isKO = true;
        aiLead.isLead = false;
        koEvents.push({
          tickN: v2Result.tickN,
          agentId: aiLead.agentId,
          side: 'ai',
          killerAgentId: humanLead?.agentId,
        });

        const nextAlive = aiAgents.findIndex((a, i) => i !== aiLeadIdx && !a.isKO);
        if (nextAlive !== -1) {
          aiLeadIdx = nextAlive;
          aiAgents[nextAlive].isLead = true;
        }
      }
    }
  }

  // Favorable ticks heal human lead
  if (tick.isFavorable) {
    const humanLead = humanAgents[humanLeadIdx];
    if (humanLead && !humanLead.isKO && humanLead.hp < humanLead.maxHP) {
      const char = getAgentCharacter(humanLead.agentId);
      const heal = calculateTickHeal(
        tick.tickClass,
        char?.baseStats.synergy ?? 60,
        newV2State.vsMeter.value,
      );

      if (heal > 0) {
        const prevHP = humanLead.hp;
        humanLead.hp = Math.min(humanLead.maxHP, humanLead.hp + heal);
        humanLead.totalHPHealed += heal;

        hpChanges.push({
          agentId: humanLead.agentId,
          side: 'human',
          previousHP: prevHP,
          damage: 0,
          heal,
          newHP: humanLead.hp,
          source: 'tick',
        });
      }
    }
  }

  // ── Step 3: Update cooldowns ──
  let switchCooldown = Math.max(0, state.switchCooldown - 1);
  let guardCooldown = Math.max(0, state.guardCooldown - 1);
  let guardActiveTicksLeft = Math.max(0, state.guardActiveTicksLeft - 1);
  let forcedIdleTicksLeft = Math.max(0, state.forcedIdleTicksLeft - 1);

  // ── Step 4: Challenge trigger check ──
  let challengeTriggered: ChartChallenge | null = null;
  let activeChallenge = state.activeChallenge;

  // Expire active challenge if timed out
  if (activeChallenge && activeChallenge.result === 'pending') {
    if (Date.now() >= activeChallenge.expiresAt) {
      activeChallenge = {
        ...activeChallenge,
        result: 'timeout',
      };
    }
  }

  // Trigger new challenge every N ticks if no active challenge
  if (!activeChallenge || activeChallenge.result !== 'pending') {
    if (v2Result.tickN > 0 && v2Result.tickN % CHALLENGE_CONFIG.TRIGGER_INTERVAL === 0) {
      challengeTriggered = generateChallenge(
        v2Result.tickN,
        tick,
        newV2State,
        humanAgents,
        aiAgents,
      );
      activeChallenge = challengeTriggered;
    }
  }

  // ── Step 5: Check team wipe ──
  let v3Status: V3BattleState['v3Status'] = state.v3Status;
  const humanAlive = humanAgents.filter(a => !a.isKO).length;
  const aiAlive = aiAgents.filter(a => !a.isKO).length;

  if (humanAlive === 0) {
    v3Status = 'human_team_ko';
  } else if (aiAlive === 0) {
    v3Status = 'ai_team_ko';
  } else if (newV2State.status === 'finished') {
    v3Status = 'finished';
  }

  // Build updated challenges list
  const challenges = [...state.challenges];
  if (challengeTriggered) {
    challenges.push(challengeTriggered);
  }

  // ── Step 6: Resolve timed-out challenge ──
  let challengeResolved: ChartChallenge | null = null;
  const challengeScore = { ...state.challengeScore };

  if (activeChallenge && activeChallenge.result === 'timeout' && activeChallenge !== state.activeChallenge) {
    challengeResolved = activeChallenge;
    challengeScore.timeout++;
    challengeScore.total++;
    activeChallenge = null;
  }

  return {
    v2Result,
    hpChanges,
    challengeTriggered,
    challengeResolved,
    koEvents,
    leadSwitchOccurred,
  };
}

/**
 * Apply a v3 tick result to the state. Returns updated state.
 */
export function applyV3TickResult(
  state: V3BattleState,
  result: V3TickResult,
): V3BattleState {
  const newV2State = v2ProcessTick(state.v2State, result.v2Result.classifiedTick.currentPrice);

  // Apply HP changes
  let humanAgents = state.humanAgents.map(a => ({ ...a }));
  let aiAgents = state.aiAgents.map(a => ({ ...a }));

  for (const change of result.hpChanges) {
    const agents = change.side === 'human' ? humanAgents : aiAgents;
    const idx = agents.findIndex(a => a.agentId === change.agentId);
    if (idx !== -1) {
      agents[idx] = {
        ...agents[idx],
        hp: change.newHP,
        isKO: change.newHP <= 0,
        totalHPDamageReceived: agents[idx].totalHPDamageReceived + change.damage,
        totalHPHealed: agents[idx].totalHPHealed + change.heal,
      };
    }
  }

  // Update lead indices from KO events
  let humanLeadIdx = state.humanLeadIdx;
  let aiLeadIdx = state.aiLeadIdx;

  for (const ko of result.koEvents) {
    if (ko.side === 'human') {
      const currentLead = humanAgents[humanLeadIdx];
      if (currentLead && currentLead.isKO) {
        const nextAlive = humanAgents.findIndex((a, i) => !a.isKO);
        if (nextAlive !== -1) {
          humanLeadIdx = nextAlive;
          humanAgents = humanAgents.map((a, i) => ({ ...a, isLead: i === nextAlive }));
        }
      }
    } else {
      const currentLead = aiAgents[aiLeadIdx];
      if (currentLead && currentLead.isKO) {
        const nextAlive = aiAgents.findIndex((a, i) => !a.isKO);
        if (nextAlive !== -1) {
          aiLeadIdx = nextAlive;
          aiAgents = aiAgents.map((a, i) => ({ ...a, isLead: i === nextAlive }));
        }
      }
    }
  }

  // Check team wipe
  let v3Status: V3BattleState['v3Status'] = state.v3Status;
  const humanAlive = humanAgents.filter(a => !a.isKO).length;
  const aiAlive = aiAgents.filter(a => !a.isKO).length;

  if (humanAlive === 0) v3Status = 'human_team_ko';
  else if (aiAlive === 0) v3Status = 'ai_team_ko';
  else if (newV2State.status === 'finished') v3Status = 'finished';

  const challenges = [...state.challenges];
  if (result.challengeTriggered) {
    challenges.push(result.challengeTriggered);
  }

  return {
    ...state,
    v2State: newV2State,
    humanAgents,
    aiAgents,
    humanLeadIdx,
    aiLeadIdx,
    switchCooldown: Math.max(0, state.switchCooldown - 1),
    guardCooldown: Math.max(0, state.guardCooldown - 1),
    guardActiveTicksLeft: Math.max(0, state.guardActiveTicksLeft - 1),
    forcedIdleTicksLeft: Math.max(0, state.forcedIdleTicksLeft - 1),
    challenges,
    activeChallenge: result.challengeTriggered ?? (
      state.activeChallenge?.result === 'pending' ? state.activeChallenge : null
    ),
    koEvents: [...state.koEvents, ...result.koEvents],
    v3Status,
  };
}

// ── Player Actions ─────────────────────────────────────────────

/**
 * Player switches lead agent.
 */
export function switchLead(state: V3BattleState, newLeadIdx: number): V3BattleState {
  if (state.switchCooldown > 0) return state;
  if (newLeadIdx < 0 || newLeadIdx >= state.humanAgents.length) return state;
  if (state.humanAgents[newLeadIdx].isKO) return state;
  if (newLeadIdx === state.humanLeadIdx) return state;

  const humanAgents = state.humanAgents.map((a, i) => ({
    ...a,
    isLead: i === newLeadIdx,
  }));

  return {
    ...state,
    humanAgents,
    humanLeadIdx: newLeadIdx,
    switchCooldown: SWITCH_CONFIG.COOLDOWN_TICKS,
  };
}

/**
 * Player activates guard on lead agent.
 */
export function activateGuard(state: V3BattleState): V3BattleState {
  if (state.guardCooldown > 0) return state;

  return {
    ...state,
    guardCooldown: SWITCH_CONFIG.GUARD_COOLDOWN_TICKS,
    guardActiveTicksLeft: SWITCH_CONFIG.GUARD_DURATION_TICKS,
  };
}

/**
 * Player submits answer to active challenge.
 */
export function submitChallengeAnswer(
  state: V3BattleState,
  answer: string,
): V3BattleState {
  if (!state.activeChallenge || state.activeChallenge.result !== 'pending') {
    return state;
  }

  const challenge = { ...state.activeChallenge };
  const isCorrect = answer === challenge.correctAnswer;
  challenge.playerAnswer = answer;
  challenge.answeredAt = Date.now();
  challenge.result = isCorrect ? 'correct' : 'wrong';

  // Apply challenge effects
  let humanAgents = state.humanAgents.map(a => ({ ...a }));
  let aiAgents = state.aiAgents.map(a => ({ ...a }));
  let forcedIdleTicksLeft = state.forcedIdleTicksLeft;

  const bonus = applyChallengeResult(
    challenge,
    isCorrect,
    humanAgents,
    aiAgents,
    state.humanLeadIdx,
    state.aiLeadIdx,
    state.v2State,
  );
  challenge.bonusApplied = bonus;

  // Direction Call wrong → forced idle
  if (!isCorrect && challenge.type === 'direction_call') {
    forcedIdleTicksLeft = CHALLENGE_CONFIG.DIRECTION_CALL.wrongPenalty.idleTicks;
  }

  // Update challenge score
  const challengeScore = { ...state.challengeScore };
  if (isCorrect) challengeScore.correct++;
  else challengeScore.wrong++;
  challengeScore.total++;

  // Update challenges list
  const challenges = state.challenges.map(c =>
    c.id === challenge.id ? challenge : c
  );

  return {
    ...state,
    humanAgents,
    aiAgents,
    activeChallenge: null,
    challenges,
    challengeScore,
    forcedIdleTicksLeft,
  };
}

// ── Challenge Generation ───────────────────────────────────────

function generateChallenge(
  tickN: number,
  tick: ClassifiedTick,
  v2State: V2BattleState,
  humanAgents: V3AgentState[],
  aiAgents: V3AgentState[],
): ChartChallenge {
  // Choose challenge type based on conditions
  const type = chooseChallengeType(tick, v2State);
  const id = `challenge-${tickN}-${type}`;

  switch (type) {
    case 'direction_call':
      return createDirectionCallChallenge(id, tickN);

    case 'pattern_recognition':
      return createPatternRecognitionChallenge(id, tickN, humanAgents);

    case 'risk_decision':
      return createRiskDecisionChallenge(id, tickN, v2State.vsMeter.value);

    case 'quick_reaction':
      return createQuickReactionChallenge(id, tickN);
  }
}

function chooseChallengeType(
  tick: ClassifiedTick,
  v2State: V2BattleState,
): ChallengeType {
  const vs = v2State.vsMeter.value;

  // Risk decision when VS is extreme
  if (vs <= CHALLENGE_CONFIG.RISK_DECISION.vsThresholdLow ||
      vs >= CHALLENGE_CONFIG.RISK_DECISION.vsThresholdHigh) {
    return 'risk_decision';
  }

  // Quick reaction on strong ticks
  if (tick.tickClass === 'STRONG_UNFAVORABLE' || tick.tickClass === 'STRONG_FAVORABLE') {
    return 'quick_reaction';
  }

  // Alternate between direction and pattern
  const roll = Math.random();
  if (roll < 0.5) return 'direction_call';
  return 'pattern_recognition';
}

function createDirectionCallChallenge(id: string, tickN: number): ChartChallenge {
  // Randomly determine correct answer (will be validated against actual candles)
  const directions = ['LONG', 'SHORT', 'NEUTRAL'];
  const correctIdx = Math.floor(Math.random() * 3);

  return {
    id,
    type: 'direction_call',
    triggeredAtTick: tickN,
    timeoutMs: CHALLENGE_CONFIG.DIRECTION_CALL.timeoutMs,
    expiresAt: Date.now() + CHALLENGE_CONFIG.DIRECTION_CALL.timeoutMs,
    prompt: '다음 3캔들 방향은?',
    options: ['LONG', 'SHORT', 'NEUTRAL'],
    correctAnswer: directions[correctIdx],
    playerAnswer: null,
    answeredAt: null,
    result: 'pending',
    bonusApplied: null,
  };
}

function createPatternRecognitionChallenge(
  id: string,
  tickN: number,
  humanAgents: V3AgentState[],
): ChartChallenge {
  const allPatterns = [...CHALLENGE_CONFIG.PATTERN_RECOGNITION.patterns];
  // Pick a random correct pattern
  const correctIdx = Math.floor(Math.random() * allPatterns.length);
  const correctPattern = allPatterns[correctIdx];

  // Pick 3 wrong options
  const wrongOptions = allPatterns
    .filter(p => p !== correctPattern)
    .sort(() => Math.random() - 0.5)
    .slice(0, 3);

  // Shuffle options
  const options = [correctPattern, ...wrongOptions].sort(() => Math.random() - 0.5);

  return {
    id,
    type: 'pattern_recognition',
    triggeredAtTick: tickN,
    timeoutMs: CHALLENGE_CONFIG.PATTERN_RECOGNITION.timeoutMs,
    expiresAt: Date.now() + CHALLENGE_CONFIG.PATTERN_RECOGNITION.timeoutMs,
    prompt: '이 차트 패턴은?',
    options,
    correctAnswer: correctPattern,
    playerAnswer: null,
    answeredAt: null,
    result: 'pending',
    bonusApplied: null,
  };
}

function createRiskDecisionChallenge(
  id: string,
  tickN: number,
  vsValue: number,
): ChartChallenge {
  // Correct answer depends on next tick (simplified: random for now)
  // In real implementation, this would be validated against actual market movement
  const correctAnswer = Math.random() > 0.5 ? 'GUARD' : 'AGGRESSIVE';

  return {
    id,
    type: 'risk_decision',
    triggeredAtTick: tickN,
    timeoutMs: CHALLENGE_CONFIG.RISK_DECISION.timeoutMs,
    expiresAt: Date.now() + CHALLENGE_CONFIG.RISK_DECISION.timeoutMs,
    prompt: `VS ${Math.round(vsValue)} — GUARD or AGGRESSIVE?`,
    options: ['GUARD', 'AGGRESSIVE'],
    correctAnswer,
    playerAnswer: null,
    answeredAt: null,
    result: 'pending',
    bonusApplied: null,
  };
}

function createQuickReactionChallenge(id: string, tickN: number): ChartChallenge {
  return {
    id,
    type: 'quick_reaction',
    triggeredAtTick: tickN,
    timeoutMs: CHALLENGE_CONFIG.QUICK_REACTION.timeoutMs,
    expiresAt: Date.now() + CHALLENGE_CONFIG.QUICK_REACTION.timeoutMs,
    prompt: 'QUICK! TAP NOW!',
    options: ['TAP'],
    correctAnswer: 'TAP',
    playerAnswer: null,
    answeredAt: null,
    result: 'pending',
    bonusApplied: null,
  };
}

// ── Challenge Result Application ───────────────────────────────

function applyChallengeResult(
  challenge: ChartChallenge,
  isCorrect: boolean,
  humanAgents: V3AgentState[],
  aiAgents: V3AgentState[],
  humanLeadIdx: number,
  aiLeadIdx: number,
  v2State: V2BattleState,
): ChallengeBonus | null {
  const humanLead = humanAgents[humanLeadIdx];
  const aiLead = aiAgents[aiLeadIdx];

  switch (challenge.type) {
    case 'direction_call': {
      if (isCorrect) {
        // Bonus: deal extra damage to AI lead
        if (aiLead && !aiLead.isKO) {
          const bonusDmg = 25;
          aiLead.hp = Math.max(0, aiLead.hp - bonusDmg);
          aiLead.totalHPDamageReceived += bonusDmg;
          return {
            type: 'hp_damage',
            value: bonusDmg,
            description: '방향 정답! BURST 공격!',
            targetAgentId: aiLead.agentId,
          };
        }
      } else {
        // Penalty: human lead takes damage
        if (humanLead && !humanLead.isKO) {
          const penaltyDmg = 15;
          humanLead.hp = Math.max(0, humanLead.hp - penaltyDmg);
          humanLead.totalHPDamageReceived += penaltyDmg;
          return {
            type: 'hp_damage',
            value: -penaltyDmg,
            description: '방향 오답! 역공격!',
            targetAgentId: humanLead.agentId,
          };
        }
      }
      break;
    }

    case 'pattern_recognition': {
      if (isCorrect) {
        // Heal human lead + damage AI lead
        if (humanLead && !humanLead.isKO) {
          const heal = 15;
          humanLead.hp = Math.min(humanLead.maxHP, humanLead.hp + heal);
          humanLead.totalHPHealed += heal;
        }
        if (aiLead && !aiLead.isKO) {
          const dmg = 20;
          aiLead.hp = Math.max(0, aiLead.hp - dmg);
          aiLead.totalHPDamageReceived += dmg;
        }
        return {
          type: 'signature_activate',
          value: 20,
          description: '패턴 인식 성공! 시그니처 무브!',
        };
      }
      // No penalty for wrong pattern (learning opportunity)
      break;
    }

    case 'risk_decision': {
      if (isCorrect) {
        // Correct: heal team or deal extra damage
        if (humanLead && !humanLead.isKO) {
          const heal = 20;
          humanLead.hp = Math.min(humanLead.maxHP, humanLead.hp + heal);
          humanLead.totalHPHealed += heal;
          return {
            type: 'hp_heal',
            value: heal,
            description: '올바른 판단! 팀 강화!',
            targetAgentId: humanLead.agentId,
          };
        }
      } else {
        // Wrong: take extra damage
        if (humanLead && !humanLead.isKO) {
          const dmg = 25;
          humanLead.hp = Math.max(0, humanLead.hp - dmg);
          humanLead.totalHPDamageReceived += dmg;
          return {
            type: 'hp_damage',
            value: -dmg,
            description: '잘못된 판단! 추가 피해!',
            targetAgentId: humanLead.agentId,
          };
        }
      }
      break;
    }

    case 'quick_reaction': {
      if (isCorrect) {
        // Dodge + counter
        if (aiLead && !aiLead.isKO) {
          const counterDmg = 18;
          aiLead.hp = Math.max(0, aiLead.hp - counterDmg);
          aiLead.totalHPDamageReceived += counterDmg;
          return {
            type: 'hp_damage',
            value: counterDmg,
            description: '회피 성공! 카운터!',
            targetAgentId: aiLead.agentId,
          };
        }
      }
      // No penalty for missed quick reaction (just no bonus)
      break;
    }
  }

  return null;
}

// ── Utility ────────────────────────────────────────────────────

/**
 * Get remaining HP percentage for a team.
 */
export function getTeamHPPercent(agents: V3AgentState[]): number {
  const totalMax = agents.reduce((sum, a) => sum + a.maxHP, 0);
  const totalCurrent = agents.reduce((sum, a) => sum + a.hp, 0);
  return totalMax > 0 ? (totalCurrent / totalMax) * 100 : 0;
}

/**
 * Get the v3 battle winner.
 */
export function getV3Winner(state: V3BattleState): 'human' | 'ai' | 'draw' {
  if (state.v3Status === 'human_team_ko') return 'ai';
  if (state.v3Status === 'ai_team_ko') return 'human';

  // On timeout/TP/SL, compare remaining HP%
  const humanHP = getTeamHPPercent(state.humanAgents);
  const aiHP = getTeamHPPercent(state.aiAgents);

  if (humanHP > aiHP + 5) return 'human';
  if (aiHP > humanHP + 5) return 'ai';
  return 'draw';
}

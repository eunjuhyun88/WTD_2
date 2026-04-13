// ═══════════════════════════════════════════════════════════════
// WTD — Arena War Store (7-Phase State Machine)
// ═══════════════════════════════════════════════════════════════
//
// Svelte 4 writable store pattern (matching existing codebase)
// 7 phases: SETUP → AI_ANALYZE → HUMAN_CALL → REVEAL → BATTLE → JUDGE → RESULT
//
// 핵심 전제: "같은 데이터, 다른 해석"
// — AI 분석 결과(48팩터, C02)는 HUMAN_CALL에서 전부 공개됨

import { writable, derived, get } from 'svelte/store';
import type {
  Direction,
  BinanceKline,
  FactorResult,
  C02Result,
  FBScore,
  MarketRegime,
} from '$lib/engine/types';
import type { MarketContext } from '$lib/engine/factorEngine';
import type {
  ArenaWarPhase,
  ArenaWarMode,
  ArenaWarSetup,
  WagerAmount,
  ConsensusType,
  BattleAction,
  HumanDelta,
  GameRecord,
} from '$lib/engine/arenaWarTypes';
import type { AgentId } from '$lib/engine/types';
import { AGENT_IDS } from '$lib/engine/types';
import {
  computeHumanDelta,
  computeEmphasizedFactors,
  computeDisagreedFactors,
  classifyPairQuality,
} from '$lib/engine/arenaWarTypes';
import { saveGameRecord, searchRAG, saveRAGEntry as saveRAGEntryAPI } from '$lib/engine/gameRecordStore';
import {
  generateMockMarketContext,
  generateMock48Factors,
  generateMockAIDecision,
  generateBattleKlines,
  generateMockFBS,
  computeFactorSignature,
  detectPatterns,
  type MockAIDecision,
} from '$lib/engine/mockArenaData';
import { computeFBS } from '$lib/engine/scoring';
import { computeEmbedding } from '$lib/engine/ragEmbedding';
import type { RAGRecall } from '$lib/engine/arenaWarTypes';

// ── v3 Battle Engine imports ──
import type { V3BattleState, V3BattleInitConfig } from '$lib/engine/v3BattleTypes';
import {
  initV3Battle,
  processV3Tick,
  applyV3TickResult,
  submitChallengeAnswer as v3SubmitChallenge,
  switchLead as v3SwitchLead,
  activateGuard as v3ActivateGuard,
  getV3Winner,
  getTeamHPPercent,
} from '$lib/engine/v3BattleEngine';
import { getAgentCharacter, getTierForLevel } from '$lib/engine/agentCharacter';
import type { V2BattleConfig, V2BattleAgent } from '$lib/engine/v2BattleTypes';
import { getCombinedSynergyBonuses, findTeamSynergies } from '$lib/engine/teamSynergy';

// ─── State Interface ────────────────────────────────────────

export interface ArenaWarState {
  // Phase machine
  phase: ArenaWarPhase;
  phaseTimer: number;            // 현재 페이즈 남은 시간 (초)

  // SETUP
  setup: ArenaWarSetup;

  // AI_ANALYZE + shared context
  marketContext: MarketContext | null;
  currentPrice: number;
  regime: MarketRegime;
  factors: FactorResult[];       // 48개 전체
  aiDecision: MockAIDecision | null;
  analyzeProgress: number;       // 0-100 (애니메이션용)

  // HUMAN_CALL
  humanDirection: Direction | null;
  humanConfidence: number;
  humanEntryPrice: number;
  humanTp: number;
  humanSl: number;
  humanReasonTags: string[];
  humanReasonText: string;
  humanLocked: boolean;

  // Thinking metadata
  thinkingStartedAt: number | null;
  directionChanges: number;
  firstDirection: Direction | null;

  // REVEAL
  delta: HumanDelta | null;
  consensusType: ConsensusType | null;

  // BATTLE
  battleKlines: BinanceKline[];
  battleCurrentIndex: number;    // 현재 표시 중인 캔들 인덱스
  battleActions: BattleAction[];
  battlePaused: boolean;

  // JUDGE
  humanFBS: FBScore | null;
  aiFBS: FBScore | null;
  judgeAnimProgress: number;     // 0-100

  // RESULT
  winner: 'human' | 'ai' | 'draw' | null;
  fbsMargin: number;
  lpDelta: number;
  gameRecord: GameRecord | null;

  // RAG Context
  ragRecall: RAGRecall | null;

  // v3 Battle Engine State
  v3BattleState: V3BattleState | null;

  // Mode & Teams
  selectedMode: ArenaWarMode;
  humanTeam: AgentId[];
  aiTeam: AgentId[];
  bannedAgents: AgentId[];

  // Global
  matchId: string;
  isActive: boolean;
  error: string | null;
}

// ─── Default State ──────────────────────────────────────────

const DEFAULT_STATE: ArenaWarState = {
  phase: 'SETUP',
  phaseTimer: 0,

  setup: {
    pair: 'BTCUSDT',
    timeframe: '4h',
    wager: 0,
  },

  marketContext: null,
  currentPrice: 0,
  regime: 'ranging',
  factors: [],
  aiDecision: null,
  analyzeProgress: 0,

  humanDirection: null,
  humanConfidence: 50,
  humanEntryPrice: 0,
  humanTp: 0,
  humanSl: 0,
  humanReasonTags: [],
  humanReasonText: '',
  humanLocked: false,

  thinkingStartedAt: null,
  directionChanges: 0,
  firstDirection: null,

  delta: null,
  consensusType: null,

  battleKlines: [],
  battleCurrentIndex: 0,
  battleActions: [],
  battlePaused: false,

  humanFBS: null,
  aiFBS: null,
  judgeAnimProgress: 0,

  winner: null,
  fbsMargin: 0,
  lpDelta: 0,
  gameRecord: null,

  ragRecall: null,

  v3BattleState: null,

  selectedMode: 'pvai',
  humanTeam: [],
  aiTeam: [],
  bannedAgents: [],

  matchId: '',
  isActive: false,
  error: null,
};

// ─── Store ──────────────────────────────────────────────────

export const arenaWarStore = writable<ArenaWarState>({ ...DEFAULT_STATE });

// ─── Derived Stores ─────────────────────────────────────────

export const arenaWarPhase = derived(arenaWarStore, $s => $s.phase);
export const arenaWarTimer = derived(arenaWarStore, $s => $s.phaseTimer);
export const arenaWarIsActive = derived(arenaWarStore, $s => $s.isActive);

export const arenaWarHumanRR = derived(arenaWarStore, $s => {
  if (!$s.humanEntryPrice || !$s.humanTp || !$s.humanSl) return 0;
  const risk = Math.abs($s.humanEntryPrice - $s.humanSl);
  const reward = Math.abs($s.humanTp - $s.humanEntryPrice);
  return risk > 0 ? Math.round((reward / risk) * 100) / 100 : 0;
});

// ─── Timer Management ───────────────────────────────────────

let _timerInterval: ReturnType<typeof setInterval> | null = null;
let _battleInterval: ReturnType<typeof setInterval> | null = null;

function clearTimers() {
  if (_timerInterval) { clearInterval(_timerInterval); _timerInterval = null; }
  if (_battleInterval) { clearInterval(_battleInterval); _battleInterval = null; }
}

function startPhaseTimer(seconds: number, onComplete: () => void) {
  arenaWarStore.update(s => ({ ...s, phaseTimer: seconds }));

  _timerInterval = setInterval(() => {
    const state = get(arenaWarStore);
    if (state.phaseTimer <= 0) {
      if (_timerInterval) clearInterval(_timerInterval);
      _timerInterval = null;
      onComplete();
      return;
    }
    arenaWarStore.update(s => ({ ...s, phaseTimer: s.phaseTimer - 1 }));
  }, 1000);
}

// ─── Phase Transitions ─────────────────────────────────────

/** SETUP → AI_ANALYZE */
export function startMatch(setup?: Partial<ArenaWarSetup>) {
  clearTimers();

  const matchId = `AW-${Date.now().toString(36)}`;
  const currentState = get(arenaWarStore);

  // Auto-assign teams if not already set (e.g. non-draft mode)
  let humanTeam = currentState.humanTeam;
  let aiTeam = currentState.aiTeam;
  if (humanTeam.length === 0 || aiTeam.length === 0) {
    const teams = autoAssignTeams();
    humanTeam = teams.humanTeam;
    aiTeam = teams.aiTeam;
  }

  arenaWarStore.update(s => ({
    ...DEFAULT_STATE,
    phase: 'AI_ANALYZE' as ArenaWarPhase,
    setup: { ...s.setup, ...setup },
    selectedMode: s.selectedMode,
    humanTeam,
    aiTeam,
    bannedAgents: s.bannedAgents,
    matchId,
    isActive: true,
  }));

  // Simulate AI analysis with progress animation
  const state = get(arenaWarStore);
  const { marketContext, currentPrice, regime } = generateMockMarketContext(
    state.setup.pair,
    state.setup.timeframe
  );

  const factors = generateMock48Factors();
  const aiDecision = generateMockAIDecision(currentPrice, factors);

  // Animate progress over 4 seconds (faster for prototype)
  let progress = 0;
  const progressInterval = setInterval(() => {
    progress += 5;
    arenaWarStore.update(s => ({ ...s, analyzeProgress: Math.min(100, progress) }));
    if (progress >= 100) {
      clearInterval(progressInterval);
    }
  }, 200);

  // After 4 seconds, transition to HUMAN_CALL (with RAG search)
  setTimeout(async () => {
    clearInterval(progressInterval);

    // ── RAG Search (fire-and-forget style — doesn't block phase transition) ──
    let ragRecall: RAGRecall | null = null;
    try {
      const detectedPatterns = detectPatterns(factors);
      const embedding = computeEmbedding(
        factors, regime, state.setup.timeframe, detectedPatterns, 0.85
      );

      const ragResult = await searchRAG(
        embedding,
        aiDecision.direction,
        aiDecision.confidence,
        { pair: state.setup.pair, regime }
      );
      ragRecall = ragResult.recall;

      if (ragRecall && ragRecall.similarGamesFound > 0) {
        console.log(
          `[ArenaWar] RAG found ${ragRecall.similarGamesFound} similar games, ` +
          `win rate: ${(ragRecall.historicalWinRate * 100).toFixed(0)}%, ` +
          `confidence adj: ${ragRecall.confidenceAdjustment}`
        );
      }
    } catch (e) {
      console.warn('[ArenaWar] RAG search failed (non-blocking):', e);
    }

    arenaWarStore.update(s => ({
      ...s,
      phase: 'HUMAN_CALL',
      marketContext,
      currentPrice,
      regime,
      factors,
      aiDecision,
      analyzeProgress: 100,
      humanEntryPrice: currentPrice,
      humanTp: aiDecision.direction === 'LONG'
        ? Math.round((currentPrice * 1.02) * 100) / 100
        : Math.round((currentPrice * 0.98) * 100) / 100,
      humanSl: aiDecision.direction === 'LONG'
        ? Math.round((currentPrice * 0.985) * 100) / 100
        : Math.round((currentPrice * 1.015) * 100) / 100,
      thinkingStartedAt: Date.now(),
      ragRecall,
    }));

    // Start 45-second timer for HUMAN_CALL
    startPhaseTimer(45, () => {
      // Auto-lock if not locked
      const current = get(arenaWarStore);
      if (!current.humanLocked) {
        lockHumanDecision();
      }
    });
  }, 4000);
}

/** Update human direction */
export function setHumanDirection(direction: Direction) {
  arenaWarStore.update(s => {
    const isChange = s.humanDirection !== null && s.humanDirection !== direction;
    return {
      ...s,
      humanDirection: direction,
      directionChanges: s.directionChanges + (isChange ? 1 : 0),
      firstDirection: s.firstDirection ?? direction,
    };
  });
}

/** Update human confidence */
export function setHumanConfidence(confidence: number) {
  arenaWarStore.update(s => ({
    ...s,
    humanConfidence: Math.max(0, Math.min(100, confidence)),
  }));
}

/** Update human TP */
export function setHumanTp(tp: number) {
  arenaWarStore.update(s => ({ ...s, humanTp: tp }));
}

/** Update human SL */
export function setHumanSl(sl: number) {
  arenaWarStore.update(s => ({ ...s, humanSl: sl }));
}

/** Toggle reason tag */
export function toggleReasonTag(tag: string) {
  arenaWarStore.update(s => {
    const tags = s.humanReasonTags.includes(tag)
      ? s.humanReasonTags.filter(t => t !== tag)
      : [...s.humanReasonTags, tag];
    return { ...s, humanReasonTags: tags };
  });
}

/** Set reason text */
export function setReasonText(text: string) {
  arenaWarStore.update(s => ({ ...s, humanReasonText: text }));
}

/** HUMAN_CALL → REVEAL: Lock in human decision */
export function lockHumanDecision() {
  const state = get(arenaWarStore);
  if (state.humanLocked || !state.aiDecision) return;
  if (_timerInterval) { clearInterval(_timerInterval); _timerInterval = null; }

  // Compute delta
  const delta = computeHumanDelta(
    state.humanDirection ?? 'NEUTRAL',
    state.humanConfidence,
    state.humanTp,
    state.humanSl,
    state.humanEntryPrice,
    state.humanReasonTags,
    state.aiDecision.direction,
    state.aiDecision.confidence,
    state.aiDecision.tp,
    state.aiDecision.sl,
    state.factors
  );

  // Determine consensus
  const humanDir = state.humanDirection ?? 'NEUTRAL';
  const aiDir = state.aiDecision.direction;
  let consensusType: ConsensusType;
  if (humanDir === aiDir && humanDir !== 'NEUTRAL') {
    consensusType = Math.abs(state.humanConfidence - state.aiDecision.confidence) < 15
      ? 'consensus'
      : 'partial';
  } else if (humanDir !== aiDir && humanDir !== 'NEUTRAL' && aiDir !== 'NEUTRAL') {
    consensusType = 'dissent';
  } else {
    consensusType = 'partial';
  }

  arenaWarStore.update(s => ({
    ...s,
    humanLocked: true,
    delta,
    consensusType,
    phase: 'REVEAL',
    phaseTimer: 3,
  }));

  // REVEAL → BATTLE after 3 seconds
  startPhaseTimer(3, () => {
    startBattle();
  });
}

/** REVEAL → BATTLE (v3 engine) */
function startBattle() {
  const state = get(arenaWarStore);
  // Determine which direction the market actually goes (random with slight bias)
  const biases: Direction[] = ['LONG', 'SHORT', 'NEUTRAL'];
  const actualBias = biases[Math.floor(Math.random() * 3)] as Direction;

  const battleKlines = generateBattleKlines(state.currentPrice, actualBias);

  // ── Build v3 battle config ──
  const humanDir = state.humanDirection ?? 'NEUTRAL';
  const allAgentIds = [...state.humanTeam, ...state.aiTeam];

  // Build v2 agent config for all participating agents
  const buildV2Agent = (agentId: AgentId, weight: number): V2BattleAgent => {
    const char = getAgentCharacter(agentId);
    const role = getAgentRole(agentId);
    return {
      agentId,
      role,
      weight,
      abilities: {
        analysis: char.baseStats.analysis,
        accuracy: char.baseStats.accuracy,
        speed: char.baseStats.speed,
        instinct: char.baseStats.instinct,
      },
      specBonuses: {
        primaryActionBonus: 0.05,
        secondaryActionPenalty: -0.05,
        critBonus: 0,
        targetActions: ['DASH', 'BURST'],
      },
    };
  };

  // Build v2 agents (all 6 in the battle)
  const v2Agents: V2BattleAgent[] = allAgentIds.map((id, i) => buildV2Agent(id, 50 - i * 5));

  // Get synergy IDs for human team
  const humanSynergies = findTeamSynergies(state.humanTeam);
  const synergyIds = humanSynergies.map(s => s.id);

  // Build finding directions (mock: all agree with human direction)
  const findingDirections: Record<string, Direction> = {};
  for (const id of allAgentIds) {
    findingDirections[id] = humanDir;
  }

  const atr1m = state.currentPrice * 0.002; // ~0.2% of price as ATR

  const v2Config: V2BattleConfig = {
    entryPrice: state.humanEntryPrice,
    tpPrice: state.humanTp,
    slPrice: state.humanSl,
    direction: humanDir,
    agents: v2Agents,
    synergyIds,
    councilConsensus: state.consensusType === 'consensus' ? 'unanimous' :
                       state.consensusType === 'partial' ? 'majority' : 'split',
    hypothesisRR: state.humanTp && state.humanSl && state.humanEntryPrice
      ? Math.abs(state.humanTp - state.humanEntryPrice) / Math.abs(state.humanSl - state.humanEntryPrice)
      : 2.0,
    findingDirections: findingDirections as Record<AgentId, Direction>,
    tierVSStart: 50,
    tierTickCount: Math.min(24, battleKlines.length),
    tierAIBonus: 0,
    atr1m,
  };

  // Build v3 team configs with HP
  const agentLevel = 1; // TODO: load from agentData store when available
  const agentTier = getTierForLevel(agentLevel);

  const buildTeamConfig = (teamIds: AgentId[]) =>
    teamIds.map(id => {
      const char = getAgentCharacter(id);
      return {
        agentId: id,
        level: agentLevel,
        tier: agentTier,
        type: char.type,
        resilience: char.baseStats.resilience,
        accuracy: char.baseStats.accuracy,
      };
    });

  const v3Config: V3BattleInitConfig = {
    v2Config,
    humanTeam: buildTeamConfig(state.humanTeam),
    aiTeam: buildTeamConfig(state.aiTeam),
  };

  // Initialize v3 battle state
  const v3BattleState = initV3Battle(v3Config);

  arenaWarStore.update(s => ({
    ...s,
    phase: 'BATTLE',
    battleKlines,
    battleCurrentIndex: 0,
    phaseTimer: 120,
    v3BattleState,
  }));

  // ── v3 Battle tick loop ──
  // Feed one candle price per tick (1.5s interval, fast for prototype: 800ms)
  _battleInterval = setInterval(() => {
    const current = get(arenaWarStore);
    if (current.battlePaused) return;
    if (!current.v3BattleState) return;

    const nextIndex = current.battleCurrentIndex + 1;

    // Check if battle is over
    if (nextIndex >= current.battleKlines.length ||
        current.v3BattleState.v3Status !== 'running') {
      if (_battleInterval) clearInterval(_battleInterval);
      _battleInterval = null;
      finishBattle();
      return;
    }

    const candle = current.battleKlines[nextIndex];
    const newPrice = candle.close;

    // Process v3 tick (wraps v2)
    const v3Result = processV3Tick(current.v3BattleState, newPrice);

    // Apply tick result to state
    const updatedV3State = applyV3TickResult(current.v3BattleState, v3Result);

    // Check TP/SL hit on the candle
    const dir = current.humanDirection ?? 'NEUTRAL';
    let hit = false;
    if (dir === 'LONG') {
      if (candle.high >= current.humanTp || candle.low <= current.humanSl) hit = true;
    } else if (dir === 'SHORT') {
      if (candle.low <= current.humanTp || candle.high >= current.humanSl) hit = true;
    }

    // Check v3 status (team wipe)
    const isV3Over = updatedV3State.v3Status !== 'running';

    arenaWarStore.update(s => ({
      ...s,
      battleCurrentIndex: nextIndex,
      phaseTimer: Math.max(0, s.phaseTimer - 1),
      v3BattleState: updatedV3State,
    }));

    if (hit || isV3Over) {
      if (_battleInterval) clearInterval(_battleInterval);
      _battleInterval = null;
      setTimeout(finishBattle, 500);
    }
  }, 800); // 800ms per tick for prototype (plan: 1500ms)
}

/** Helper: get agent role from ID */
function getAgentRole(agentId: AgentId): 'OFFENSE' | 'DEFENSE' | 'CONTEXT' {
  const offenseAgents: AgentId[] = ['STRUCTURE', 'VPA', 'ICT'];
  const defenseAgents: AgentId[] = ['DERIV', 'VALUATION', 'FLOW'];
  if (offenseAgents.includes(agentId)) return 'OFFENSE';
  if (defenseAgents.includes(agentId)) return 'DEFENSE';
  return 'CONTEXT';
}

/** Add battle action (HOLD/ADJUST_TP/ADJUST_SL/CUT) */
export function addBattleAction(
  action: BattleAction['action'],
  newValue?: number
) {
  const state = get(arenaWarStore);
  const currentCandle = state.battleKlines[state.battleCurrentIndex];
  if (!currentCandle) return;

  const unrealizedPnl = state.humanDirection === 'LONG'
    ? (currentCandle.close - state.humanEntryPrice) / state.humanEntryPrice
    : (state.humanEntryPrice - currentCandle.close) / state.humanEntryPrice;

  const battleAction: BattleAction = {
    checkpoint: state.battleCurrentIndex,
    action,
    newValue,
    priceAtAction: currentCandle.close,
    unrealizedPnl: Math.round(unrealizedPnl * 10000) / 10000,
  };

  arenaWarStore.update(s => ({
    ...s,
    battleActions: [...s.battleActions, battleAction],
    ...(action === 'ADJUST_TP' && newValue ? { humanTp: newValue } : {}),
    ...(action === 'ADJUST_SL' && newValue ? { humanSl: newValue } : {}),
  }));

  if (action === 'CUT') {
    if (_battleInterval) clearInterval(_battleInterval);
    _battleInterval = null;
    finishBattle();
  }
}

/** BATTLE → JUDGE */
function finishBattle() {
  const state = get(arenaWarStore);
  const exitCandle = state.battleKlines[state.battleCurrentIndex];
  const exitPrice = exitCandle?.close ?? state.currentPrice;

  const priceChange = (exitPrice - state.currentPrice) / state.currentPrice;
  const actualDirection: Direction =
    priceChange > 0.001 ? 'LONG' :
    priceChange < -0.001 ? 'SHORT' :
    'NEUTRAL';

  // Determine winner — prefer v3 HP-based winner if available
  const humanDir = state.humanDirection ?? 'NEUTRAL';
  const aiDir = state.aiDecision?.direction ?? 'NEUTRAL';
  const humanCorrect = humanDir === actualDirection;
  const aiCorrect = aiDir === actualDirection;

  const humanFBS = generateMockFBS(humanCorrect);
  const aiFBS = generateMockFBS(aiCorrect);

  // v3 winner determination: HP-based + challenge score weighting
  let winner: 'human' | 'ai' | 'draw';
  if (state.v3BattleState) {
    const v3Winner = getV3Winner(state.v3BattleState);
    // Blend v3 HP winner with FBS score (v3 is primary)
    if (v3Winner !== 'draw') {
      winner = v3Winner;
    } else {
      // Tie-break with FBS
      winner = humanFBS.fbs > aiFBS.fbs ? 'human' :
               aiFBS.fbs > humanFBS.fbs ? 'ai' : 'draw';
    }
  } else {
    winner = humanFBS.fbs > aiFBS.fbs ? 'human' :
             aiFBS.fbs > humanFBS.fbs ? 'ai' : 'draw';
  }

  const fbsMargin = Math.abs(humanFBS.fbs - aiFBS.fbs);

  arenaWarStore.update(s => ({
    ...s,
    phase: 'JUDGE',
    humanFBS,
    aiFBS,
    winner,
    fbsMargin,
    judgeAnimProgress: 0,
  }));

  // Animate judge score count-up over 3 seconds
  let progress = 0;
  const judgeInterval = setInterval(() => {
    progress += 4;
    arenaWarStore.update(s => ({
      ...s,
      judgeAnimProgress: Math.min(100, progress),
    }));

    if (progress >= 100) {
      clearInterval(judgeInterval);
      // After animation, go to RESULT
      setTimeout(() => {
        showResult(exitPrice, priceChange, actualDirection);
      }, 500);
    }
  }, 120);
}

/** JUDGE → RESULT */
function showResult(exitPrice: number, priceChange: number, actualDirection: Direction) {
  const state = get(arenaWarStore);

  // Calculate LP delta
  const isWin = state.winner === 'human';
  const isDissent = state.consensusType === 'dissent';
  const baseLP = isWin ? 8 : -3;
  const dissentBonus = isWin && isDissent ? 5 : 0;
  const lpDelta = baseLP + dissentBonus;

  // Build GameRecord
  const thinkingTimeMs = state.thinkingStartedAt
    ? Date.now() - state.thinkingStartedAt
    : 0;

  const gameRecord: GameRecord = {
    id: state.matchId,
    version: 1,
    createdAt: Date.now(),
    context: {
      pair: state.setup.pair,
      timeframe: state.setup.timeframe,
      regime: state.regime,
      klines: state.marketContext?.klines ?? [],
      factors: state.factors,
      factorSignature: computeFactorSignature(state.factors),
      detectedPatterns: detectPatterns(state.factors),
      dataCompleteness: 0.85, // mock
    },
    human: {
      direction: state.humanDirection ?? 'NEUTRAL',
      confidence: state.humanConfidence,
      entryPrice: state.humanEntryPrice,
      tp: state.humanTp,
      sl: state.humanSl,
      reasonTags: state.humanReasonTags,
      reasonText: state.humanReasonText || undefined,
      delta: state.delta ?? {
        sameDirection: true,
        confidenceDiff: 0,
        tpDiff: 0,
        slDiff: 0,
        disagreedFactors: [],
        emphasizedFactors: [],
      },
      thinkingTimeMs,
      directionChanges: state.directionChanges,
      firstDirection: state.firstDirection ?? 'NEUTRAL',
      battleActions: state.battleActions,
    },
    ai: {
      c02Result: state.aiDecision?.c02Result ?? {} as C02Result,
      direction: state.aiDecision?.direction ?? 'NEUTRAL',
      confidence: state.aiDecision?.confidence ?? 50,
      entryPrice: state.aiDecision?.entryPrice ?? state.currentPrice,
      tp: state.aiDecision?.tp ?? 0,
      sl: state.aiDecision?.sl ?? 0,
      ragRecall: state.ragRecall ?? null,
      factorConflicts: state.aiDecision?.c02Result.commander
        ? {
            orpoSays: state.aiDecision.c02Result.orpo.direction,
            ctxSays: state.aiDecision.c02Result.commander.finalDirection,
            conflictAgents: state.aiDecision.c02Result.ctx
              .filter(c => c.flag !== 'NEUTRAL')
              .map(c => c.agentId),
            resolution: state.aiDecision.c02Result.commander.reasoning,
          }
        : null,
    },
    outcome: {
      exitPrice,
      priceChange,
      actualDirection,
      resolution: 'TIME_EXPIRY',
      humanPnl: state.humanDirection === 'LONG'
        ? priceChange
        : state.humanDirection === 'SHORT'
          ? -priceChange
          : 0,
      aiPnl: state.aiDecision?.direction === 'LONG'
        ? priceChange
        : state.aiDecision?.direction === 'SHORT'
          ? -priceChange
          : 0,
      humanFBS: state.humanFBS ?? { ds: 0, re: 0, ci: 0, fbs: 0 },
      aiFBS: state.aiFBS ?? { ds: 0, re: 0, ci: 0, fbs: 0 },
      winner: state.winner ?? 'draw',
      fbsMargin: state.fbsMargin,
      consensusType: state.consensusType ?? 'partial',
    },
    derived: {
      orpoPair: {
        chosen: {
          direction: state.winner === 'human'
            ? (state.humanDirection ?? 'NEUTRAL')
            : (state.aiDecision?.direction ?? 'NEUTRAL'),
          confidence: state.winner === 'human'
            ? state.humanConfidence
            : (state.aiDecision?.confidence ?? 50),
          entryPrice: state.humanEntryPrice,
          tp: state.winner === 'human' ? state.humanTp : (state.aiDecision?.tp ?? 0),
          sl: state.winner === 'human' ? state.humanSl : (state.aiDecision?.sl ?? 0),
          reasonTags: state.winner === 'human' ? state.humanReasonTags : [],
          topFactors: state.factors
            .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
            .slice(0, 5)
            .map(f => ({ factorId: f.factorId, value: f.value })),
        },
        rejected: {
          direction: state.winner === 'human'
            ? (state.aiDecision?.direction ?? 'NEUTRAL')
            : (state.humanDirection ?? 'NEUTRAL'),
          confidence: state.winner === 'human'
            ? (state.aiDecision?.confidence ?? 50)
            : state.humanConfidence,
          entryPrice: state.humanEntryPrice,
          tp: state.winner === 'human' ? (state.aiDecision?.tp ?? 0) : state.humanTp,
          sl: state.winner === 'human' ? (state.aiDecision?.sl ?? 0) : state.humanSl,
          reasonTags: state.winner !== 'human' ? state.humanReasonTags : [],
          topFactors: state.factors
            .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
            .slice(0, 5)
            .map(f => ({ factorId: f.factorId, value: f.value })),
        },
        context: {
          pair: state.setup.pair,
          timeframe: state.setup.timeframe,
          regime: state.regime,
          factorSignature: computeFactorSignature(state.factors),
          detectedPatterns: detectPatterns(state.factors),
          dataCompleteness: 0.85,
        },
        margin: state.fbsMargin,
        quality: classifyPairQuality(
          state.fbsMargin,
          state.humanReasonTags,
          thinkingTimeMs
        ),
        consensusType: state.consensusType ?? 'partial',
      },
      ragEntry: {
        patternSignature: detectPatterns(state.factors).join('_') || 'UNKNOWN',
        embedding: computeEmbedding(
          state.factors,
          state.regime,
          state.setup.timeframe,
          detectPatterns(state.factors),
          0.85
        ),
        regime: state.regime,
        pair: state.setup.pair,
        timeframe: state.setup.timeframe,
        humanDecision: {
          direction: state.humanDirection ?? 'NEUTRAL',
          confidence: state.humanConfidence,
          reasonTags: state.humanReasonTags,
          tp: state.humanTp,
          sl: state.humanSl,
        },
        aiDecision: {
          direction: state.aiDecision?.direction ?? 'NEUTRAL',
          confidence: state.aiDecision?.confidence ?? 50,
          topFactors: state.factors
            .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
            .slice(0, 5)
            .map(f => f.factorId),
        },
        outcome: {
          winner: state.winner ?? 'draw',
          humanFBS: state.humanFBS?.fbs ?? 0,
          aiFBS: state.aiFBS?.fbs ?? 0,
          priceChange,
        },
        lesson: `${state.regime} 레짐에서 ${state.humanDirection} ${state.humanConfidence}% → ${state.winner === 'human' ? '승' : '패'}`,
        quality: classifyPairQuality(
          state.fbsMargin,
          state.humanReasonTags,
          thinkingTimeMs
        ),
        timestamp: Date.now(),
        gameRecordId: state.matchId,
      },
      feedback: {
        immediate: generateFeedback(state),
        calibrationDelta: 0,
        newPatternDiscovered: false,
      },
    },
  };

  arenaWarStore.update(s => ({
    ...s,
    phase: 'RESULT',
    lpDelta,
    gameRecord,
  }));

  // 서버에 GameRecord 저장 (fire-and-forget)
  saveGameRecord(gameRecord).then(result => {
    if (result.success && gameRecord.derived.ragEntry) {
      // RAG 저장 (fire-and-forget — GameRecord 저장 성공 후에만)
      saveRAGEntryAPI(gameRecord.id, gameRecord.derived.ragEntry).catch(e =>
        console.warn('[ArenaWar] Failed to persist RAG entry:', e)
      );
    }
  }).catch(e =>
    console.warn('[ArenaWar] Failed to persist GameRecord:', e)
  );
}

/** Generate immediate feedback text */
function generateFeedback(state: ArenaWarState): string {
  const parts: string[] = [];

  if (state.winner === 'human') {
    parts.push('승리!');
    if (state.consensusType === 'dissent') {
      parts.push('AI와 반대로 판단해서 이겼습니다. DISSENT WIN +5 LP!');
    }
  } else if (state.winner === 'ai') {
    parts.push('AI가 이번 판을 가져갔습니다.');
  } else {
    parts.push('무승부.');
  }

  if (state.humanFBS && state.aiFBS) {
    const dsWin = state.humanFBS.ds > state.aiFBS.ds;
    const reWin = state.humanFBS.re > state.aiFBS.re;
    const ciWin = state.humanFBS.ci > state.aiFBS.ci;

    if (dsWin && !reWin) {
      parts.push('방향은 잘 맞혔지만, 리스크 관리(TP/SL)를 개선해보세요.');
    } else if (!dsWin && reWin) {
      parts.push('리스크 관리는 좋았지만, 방향 판단을 다시 검토해보세요.');
    }

    if (ciWin) {
      parts.push('확신도 조절이 정확했습니다!');
    }
  }

  return parts.join(' ');
}

// ─── v3 Player Actions (exported for BattlePhase) ───────────

/** Submit answer to active chart reading challenge */
export function submitBattleChallengeAnswer(answer: string) {
  arenaWarStore.update(s => {
    if (!s.v3BattleState) return s;
    const updated = v3SubmitChallenge(s.v3BattleState, answer);
    return { ...s, v3BattleState: updated };
  });
}

/** Switch lead agent during battle */
export function switchBattleLead(newLeadIdx: number) {
  arenaWarStore.update(s => {
    if (!s.v3BattleState) return s;
    const updated = v3SwitchLead(s.v3BattleState, newLeadIdx);
    return { ...s, v3BattleState: updated };
  });
}

/** Activate guard on lead agent */
export function activateBattleGuard() {
  arenaWarStore.update(s => {
    if (!s.v3BattleState) return s;
    const updated = v3ActivateGuard(s.v3BattleState);
    return { ...s, v3BattleState: updated };
  });
}

/** Reset and start a new match */
export function rematch() {
  const state = get(arenaWarStore);
  clearTimers();
  startMatch(state.setup);
}

/** Full reset to SETUP */
export function resetArenaWar() {
  clearTimers();
  arenaWarStore.set({ ...DEFAULT_STATE });
}

/** Update setup config */
export function updateSetup(updates: Partial<ArenaWarSetup>) {
  arenaWarStore.update(s => ({
    ...s,
    setup: { ...s.setup, ...updates },
  }));
}

/** Set game mode */
export function setSelectedMode(mode: ArenaWarMode) {
  arenaWarStore.update(s => ({ ...s, selectedMode: mode }));
}

/** Set teams (from draft or auto-assign) */
export function setTeams(humanTeam: AgentId[], aiTeam: AgentId[], banned: AgentId[] = []) {
  arenaWarStore.update(s => ({ ...s, humanTeam, aiTeam, bannedAgents: banned }));
}

/** Start draft phase */
export function startDraft(setup?: Partial<ArenaWarSetup>) {
  arenaWarStore.update(s => ({
    ...s,
    phase: 'DRAFT' as ArenaWarPhase,
    setup: { ...s.setup, ...setup },
    selectedMode: 'draft',
  }));
}

/** Auto-assign random teams for non-draft modes */
function autoAssignTeams(): { humanTeam: AgentId[]; aiTeam: AgentId[] } {
  const shuffled = [...AGENT_IDS].sort(() => Math.random() - 0.5) as AgentId[];
  return {
    humanTeam: shuffled.slice(0, 3),
    aiTeam: shuffled.slice(3, 6),
  };
}

/** Derived store: current mode */
export const arenaWarMode = derived(arenaWarStore, $s => $s.selectedMode);

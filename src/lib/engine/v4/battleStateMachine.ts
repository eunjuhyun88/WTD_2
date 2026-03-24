// ═══════════════════════════════════════════════════════════════
// COGOCHI — Battle State Machine v4 Orchestrator
// 7-state pipeline: OBSERVE→RETRIEVE→REASON→DEBATE→DECIDE→RESOLVE→REFLECT
// Always forward, never backward. Each state has its own fallback.
// Design: BattleStateMachine_20260322
// ═══════════════════════════════════════════════════════════════

import type {
  BattleTickState,
  BattleScenario,
  ScenarioFrame,
  OwnedAgent,
  StageFrame,
  PlayerIntervention,
  MatchResult,
} from './types.js';
import { observe } from './states/observe.js';
import { retrieve } from './states/retrieve.js';
import { reason } from './states/reason.js';
import { debate } from './states/debate.js';
import { decide } from './states/decide.js';
import { resolve } from './states/resolve.js';
import { reflect } from './states/reflect.js';

// ─── Run a single battle tick ──────────────────────────────────

export async function runBattleTick(
  state: BattleTickState,
  intervention?: PlayerIntervention,
): Promise<BattleTickState> {
  let current: BattleTickState = intervention
    ? { ...state, playerIntervention: intervention }
    : state;

  // OBSERVE (sync)
  current = observe(current);

  // RETRIEVE (async — memory search with timeout)
  current = await retrieve(current);

  // REASON (async — LLM calls with timeout)
  current = await reason(current);

  // DEBATE (async — multi-round adversarial + risk tribunal + judge)
  current = await debate(current);

  // DECIDE (sync — compile to GameActionPlan)
  current = decide(current);

  // RESOLVE (sync — apply outcome, update HP/zones)
  current = resolve(current);

  // REFLECT (sync — memory cards, reflection, ORPO queue)
  current = reflect(current);

  return current;
}

// ─── Initialize a new battle ───────────────────────────────────

export function initBattle(
  scenario: BattleScenario,
  squad: OwnedAgent[],
  totalRounds: number = 3,
  objectiveThreshold: number = 0.45,
  tickLimit: number = 24,
): BattleTickState {
  const scenarioFrame: ScenarioFrame = {
    id: scenario.id,
    label: scenario.label,
    startTimestamp: scenario.startTimestamp,
    endTimestamp: scenario.endTimestamp,
    tickCount: scenario.candles.length,
    tick: 0,
    round: 1,
    totalRounds,
    objectiveLabel: scenario.label,
    objectiveThreshold,
    objectiveProgress: 0,
    tickLimit,
    symbol: 'BTCUSDT',
    signalDataHash: hashScenarioData(scenario),
  };

  const initialStage: StageFrame = {
    verticalBias: 0,
    capturedZones: [],
    zoneControlScore: 0,
    supportIntegrity: 1.0,
    predatorZones: [],
    breakoutGateActive: false,
    tick: 0,
  };

  return {
    scenarioId: scenario.id,
    tick: 0,
    round: 1,
    state: 'OBSERVE',
    squad: squad.map(a => ({
      ...a,
      record: {
        ...a.record,
        currentHealth: a.record.currentHealth ?? 1.0,
      },
    })),
    scenario: scenarioFrame,
    battleScenario: scenario,
    stage: initialStage,
    tradeHistory: { trades: [], totalPnl: 0, unrealizedPnl: 0, tradeCount: 0, winCount: 0, lossCount: 0 },
    events: [],
    startedAt: Date.now(),
  };
}

// ─── Run a full battle (all ticks until match result) ──────────

export async function runFullBattle(
  scenario: BattleScenario,
  squad: OwnedAgent[],
  options?: {
    totalRounds?: number;
    objectiveThreshold?: number;
    tickLimit?: number;
    onTick?: (state: BattleTickState) => void;
  },
): Promise<BattleTickState> {
  let state = initBattle(
    scenario,
    squad,
    options?.totalRounds,
    options?.objectiveThreshold,
    options?.tickLimit,
  );

  const maxTicks = Math.min(state.scenario.tickLimit, scenario.candles.length);

  for (let tick = 0; tick < maxTicks; tick++) {
    state = {
      ...state,
      tick,
      scenario: { ...state.scenario, tick },
    };

    state = await runBattleTick(state);

    // Notify listener
    options?.onTick?.(state);

    // Check if match ended
    if (state.matchResult) {
      break;
    }
  }

  // If no match result after all ticks, force a result
  if (!state.matchResult) {
    state = {
      ...state,
      matchResult: state.stage.zoneControlScore > 0.3 ? 'DRAW' : 'LOSS',
    };
  }

  return state;
}

// ─── Create default squad ──────────────────────────────────────

export function createDefaultSquad(
  userId: string,
  agentName: string = 'Agent',
  archetype: 'CRUSHER' | 'RIDER' | 'ORACLE' | 'GUARDIAN' = 'CRUSHER',
): OwnedAgent[] {
  const defaultLoadout = {
    systemPrompt: `You are ${agentName}, specialized in crypto market analysis.`,
    rolePrompt: '',
    riskStyle: 'moderate' as const,
    horizon: 'swing' as const,
    enabledDataSources: ['cvd', 'funding', 'oi', 'htf'],
    signalWeights: { cvdDivergence: 0.5, fundingRate: 0.5, openInterest: 0.5, htfStructure: 0.5 },
    retrievalPolicy: { minDoctrineCards: 1, minFailureCards: 1, maxTotalCards: 5 },
  };

  const defaultRecord = {
    currentHealth: 1.0,
    totalBattles: 0,
    wins: 0,
    losses: 0,
    currentStreak: 0,
    xp: 0,
  };

  const roles: Array<{ role: 'SCOUT' | 'ANALYST' | 'RISK' | 'EXECUTOR'; arch: typeof archetype }> = [
    { role: 'EXECUTOR', arch: archetype },
    { role: 'ANALYST', arch: archetype === 'CRUSHER' ? 'ORACLE' : 'CRUSHER' },
    { role: 'RISK', arch: 'GUARDIAN' },
    { role: 'SCOUT', arch: 'RIDER' },
  ];

  return roles.map((r, i) => ({
    id: `${userId}-${r.arch.toLowerCase()}-${i}`,
    name: `${agentName} ${r.role}`,
    archetypeId: r.arch,
    squadRole: r.role,
    stage: 0,
    bond: 50,
    level: 1,
    version: 0,
    loadout: { ...defaultLoadout },
    record: { ...defaultRecord },
  }));
}

// ─── Helpers ───────────────────────────────────────────────────

function hashScenarioData(scenario: BattleScenario): string {
  // Simple hash for integrity check
  const data = `${scenario.id}:${scenario.candles.length}:${scenario.startTimestamp}:${scenario.endTimestamp}`;
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

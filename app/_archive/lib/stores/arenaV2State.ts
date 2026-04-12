// =================================================================
// STOCKCLAW Arena v2 — Game State Store
// =================================================================
// Separate from the v1 gameState to avoid conflicts.
// This store drives the entire /arena-v2 page.
// =================================================================

import { writable, derived } from 'svelte/store';
import type { Direction, AgentId } from '$lib/engine/types';
import type { FBScore, Badge } from '$lib/engine/types';
import type {
  V2BattleState,
  V2BattleResult,
  AgentAnimState,
} from '$lib/engine/v2BattleTypes';

// ── Types ───────────────────────────────────────────────────────

export type V2Phase = 'LOBBY' | 'DRAFT' | 'ANALYSIS' | 'HYPOTHESIS' | 'BATTLE' | 'RESULT';
export type V2SubPhase = 'SCOUT' | 'GATHER' | 'COUNCIL' | null;
export type V2ArenaView = 'arena' | 'chart' | 'mission' | 'card';

export interface Finding {
  agentId: string;
  title: string;
  detail: string;
  direction: Direction;
  confidence: number;
  icon: string;
  timestamp: number;
}

export interface Vote {
  agentId: string;
  direction: Direction;
  confidence: number;
  speech: string;
}

export interface ChatMsg {
  id: string;
  agentId: string;
  text: string;
  timestamp: number;
  type: 'scout' | 'finding' | 'council' | 'battle' | 'system';
  color?: string;
  icon?: string;
}

export interface CharSpriteState {
  agentId: string;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  animState: AgentAnimState;
  scale: number;
  flipX: boolean;
  visible: boolean;
}

export interface V2Hypothesis {
  dir: Direction;
  conf: number;
  entry: number;
  tp: number;
  sl: number;
  rr: number;
}

export type V2Tier = 'BRONZE' | 'SILVER' | 'GOLD' | 'DIAMOND' | 'MASTER';

export interface V2SquadConfig {
  riskLevel: 'low' | 'mid' | 'aggro';
  timeframe: string;
  leverage: number;
  tier: V2Tier;
}

// ── Main State Interface ────────────────────────────────────────

export interface ArenaV2State {
  // Phase machine
  phase: V2Phase;
  subPhase: V2SubPhase;
  timer: number;
  phaseStartTime: number;

  // Draft
  selectedAgents: AgentId[];
  weights: Record<string, number>;
  squadConfig: V2SquadConfig;

  // Analysis
  findings: Finding[];
  councilVotes: Vote[];
  consensusDir: Direction;
  consensusConf: number;
  consensusType: 'unanimous' | 'majority' | 'split';

  // Characters
  charSprites: Record<string, CharSpriteState>;
  chatMessages: ChatMsg[];

  // Hypothesis
  hypothesis: V2Hypothesis | null;

  // Battle
  battleState: V2BattleState | null;
  battleResult: V2BattleResult | null;

  // View
  currentView: V2ArenaView;

  // Result
  lpDelta: number;
  lpBreakdown: string[];
  fbsScore: FBScore | null;
  badges: Badge[];

  // Meta
  matchId: string | null;
  running: boolean;
  speed: number;

  // RAG
  ragRecall: import('$lib/engine/arenaWarTypes').RAGRecall | null;
  ragSaved: boolean;

  // Price (live feed)
  btcPrice: number;
}

// ── Default State ───────────────────────────────────────────────

const DEFAULT_STATE: ArenaV2State = {
  phase: 'LOBBY',
  subPhase: null,
  timer: 0,
  phaseStartTime: 0,

  selectedAgents: [],
  weights: {},
  squadConfig: {
    riskLevel: 'mid',
    timeframe: '5m',
    leverage: 1,
    tier: 'BRONZE',
  },

  findings: [],
  councilVotes: [],
  consensusDir: 'NEUTRAL',
  consensusConf: 0,
  consensusType: 'split',

  charSprites: {},
  chatMessages: [],

  hypothesis: null,

  battleState: null,
  battleResult: null,

  currentView: 'arena',

  lpDelta: 0,
  lpBreakdown: [],
  fbsScore: null,
  badges: [],

  matchId: null,
  running: false,
  speed: 3,

  ragRecall: null,
  ragSaved: false,

  btcPrice: 0,
};

// ── Store ───────────────────────────────────────────────────────

export const arenaV2State = writable<ArenaV2State>({ ...DEFAULT_STATE });

// ── Derived Stores ──────────────────────────────────────────────

export const v2Phase = derived(arenaV2State, $s => $s.phase);
export const v2SubPhase = derived(arenaV2State, $s => $s.subPhase);
export const v2Running = derived(arenaV2State, $s => $s.running);
export const v2CurrentView = derived(arenaV2State, $s => $s.currentView);
export const v2SelectedAgents = derived(arenaV2State, $s => $s.selectedAgents);
export const v2BattleState = derived(arenaV2State, $s => $s.battleState);

// ── Actions ─────────────────────────────────────────────────────

export function v2SetPhase(phase: V2Phase, subPhase: V2SubPhase = null) {
  arenaV2State.update(s => ({
    ...s,
    phase,
    subPhase,
    phaseStartTime: Date.now(),
  }));
}

export function v2SetView(view: V2ArenaView) {
  arenaV2State.update(s => ({ ...s, currentView: view }));
}

export function v2StartRound() {
  arenaV2State.update(s => ({
    ...s,
    phase: 'DRAFT',
    subPhase: null,
    running: true,
    selectedAgents: [],
    weights: {},
    findings: [],
    councilVotes: [],
    chatMessages: [],
    hypothesis: null,
    battleState: null,
    battleResult: null,
    lpDelta: 0,
    lpBreakdown: [],
    fbsScore: null,
    badges: [],
    matchId: crypto.randomUUID(),
    phaseStartTime: Date.now(),
  }));
}

export function v2SelectAgent(agentId: AgentId) {
  arenaV2State.update(s => {
    if (s.selectedAgents.includes(agentId)) return s;
    if (s.selectedAgents.length >= 3) return s;

    const newSelected = [...s.selectedAgents, agentId];
    const weight = Math.floor(100 / newSelected.length);
    const remainder = 100 - weight * newSelected.length;

    const newWeights: Record<string, number> = {};
    newSelected.forEach((id, i) => {
      newWeights[id] = weight + (i === 0 ? remainder : 0);
    });

    return { ...s, selectedAgents: newSelected, weights: newWeights };
  });
}

export function v2DeselectAgent(agentId: AgentId) {
  arenaV2State.update(s => {
    const newSelected = s.selectedAgents.filter(id => id !== agentId);
    if (newSelected.length === 0) return { ...s, selectedAgents: [], weights: {} };

    const weight = Math.floor(100 / newSelected.length);
    const remainder = 100 - weight * newSelected.length;

    const newWeights: Record<string, number> = {};
    newSelected.forEach((id, i) => {
      newWeights[id] = weight + (i === 0 ? remainder : 0);
    });

    return { ...s, selectedAgents: newSelected, weights: newWeights };
  });
}

export function v2SetWeight(agentId: string, newWeight: number) {
  arenaV2State.update(s => {
    const clamped = Math.max(10, Math.min(80, newWeight));
    const others = s.selectedAgents.filter(id => id !== agentId);
    const remaining = 100 - clamped;

    // Distribute remaining proportionally
    const currentOtherTotal = others.reduce((sum, id) => sum + (s.weights[id] ?? 33), 0);
    const newWeights: Record<string, number> = { [agentId]: clamped };

    others.forEach(id => {
      const ratio = currentOtherTotal > 0 ? (s.weights[id] ?? 33) / currentOtherTotal : 1 / others.length;
      newWeights[id] = Math.max(10, Math.round(remaining * ratio));
    });

    // Fix rounding errors
    const total = Object.values(newWeights).reduce((a, b) => a + b, 0);
    if (total !== 100 && others.length > 0) {
      newWeights[others[0]] += (100 - total);
    }

    return { ...s, weights: newWeights };
  });
}

export function v2SetSquadConfig(config: Partial<V2SquadConfig>) {
  arenaV2State.update(s => ({
    ...s,
    squadConfig: { ...s.squadConfig, ...config },
  }));
}

export function v2AddChatMessage(msg: Omit<ChatMsg, 'id' | 'timestamp'>) {
  arenaV2State.update(s => ({
    ...s,
    chatMessages: [...s.chatMessages, {
      ...msg,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    }],
  }));
}

export function v2AddFinding(finding: Omit<Finding, 'timestamp'>) {
  arenaV2State.update(s => ({
    ...s,
    findings: [...s.findings, { ...finding, timestamp: Date.now() }],
  }));
}

export function v2SetHypothesis(hypothesis: V2Hypothesis) {
  arenaV2State.update(s => ({ ...s, hypothesis }));
}

export function v2UpdateBattleState(battleState: V2BattleState) {
  arenaV2State.update(s => ({ ...s, battleState }));
}

export function v2SetBattleResult(result: V2BattleResult) {
  arenaV2State.update(s => ({
    ...s,
    battleResult: result,
    phase: 'RESULT',
    subPhase: null,
  }));
}

export function v2Reset() {
  arenaV2State.set({ ...DEFAULT_STATE });
}

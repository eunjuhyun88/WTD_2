// ═══════════════════════════════════════════════════════════════
// STOCKCLAW — Game State Store
// ═══════════════════════════════════════════════════════════════

import { writable, derived } from 'svelte/store';
import type { CanonicalTimeframe } from '$lib/utils/timeframe';
import type { OrpoOutput, CtxBelief, CommanderVerdict, GuardianCheck, FBScore } from '$lib/engine/types';
import type { BattleTickState, BattlePriceTick } from '$lib/engine/battleResolver';
import { normalizeTimeframe } from '$lib/utils/timeframe';
import { STORAGE_KEYS } from './storageKeys';
import { btcPrice, ethPrice, solPrice } from './priceStore';
import { loadFromStorage, autoSave } from '$lib/utils/storage';

export type Phase = 'DRAFT' | 'ANALYSIS' | 'HYPOTHESIS' | 'BATTLE' | 'RESULT';
export type ViewMode = 'arena' | 'terminal' | 'passport';
export type ArenaView = 'chart' | 'arena' | 'mission' | 'card';
export type Direction = 'LONG' | 'SHORT' | 'NEUTRAL';
export type RiskLevel = 'low' | 'mid' | 'aggro';
export type SquadTimeframe = CanonicalTimeframe;
export type ArenaMode = 'PVE' | 'PVP' | 'TOURNAMENT';

export interface TournamentContext {
  tournamentId: string | null;
  round: number | null;
  type: string | null;
  pair: string | null;
  entryFeeLp: number | null;
}

export interface SquadConfig {
  riskLevel: RiskLevel;
  timeframe: SquadTimeframe;
  leverageBias: number;    // 1-10
  confidenceWeight: number; // 1-10
}

export interface Position {
  entry: number;
  tp: number;
  sl: number;
  dir: Direction;
  rr: number;
  size: number;
  lev: number;
}

export interface Hypothesis {
  dir: Direction;
  conf: number;
  tags: Set<string>;
  tf: string;
  vmode: 'tpsl' | 'close';
  closeN: number;
  entry: number;
  tp: number;
  sl: number;
  rr: number;
  consensusType?: string;
  lpMult?: number;
}

export interface GameState {
  // Navigation
  currentView: ViewMode;

  // Arena state
  arenaMode: ArenaMode;
  tournament: TournamentContext;
  phase: Phase;
  running: boolean;
  matchN: number;
  wins: number;
  losses: number;
  streak: number;
  lp: number;
  score: number;
  timer: number;
  speed: number;
  inLobby: boolean;

  // Match data
  selectedAgents: string[];
  pos: Position | null;
  hypothesis: Hypothesis | null;
  battleResult: string | null;
  battleCandlesSinceEntry: number;
  chartPattern: string | null;

  // Opponent
  opponent: {
    score: number;
    dir: Direction;
    agents: string[];
  } | null;

  // C02 Architecture outputs
  orpoOutput: OrpoOutput | null;
  ctxBeliefs: CtxBelief[];
  commanderVerdict: CommanderVerdict | null;
  guardianCheck: GuardianCheck | null;
  fbScore: FBScore | null;

  // Squad config (v2: team-wide parameters)
  squadConfig: SquadConfig;

  // Pending action (from War Room → Arena)
  pendingAction: { dir: Direction; pair: string } | null;

  // Prices (shared between arena + terminal)
  prices: { BTC: number; ETH: number; SOL: number };
  bases: { BTC: number; ETH: number; SOL: number };
  pair: string;
  timeframe: CanonicalTimeframe;

  // Arena view selection
  arenaView: ArenaView;

  // Real-time battle state (from battleResolver)
  battleTick: BattleTickState | null;
  battlePriceHistory: BattlePriceTick[];
  battleEntryTime: number;
  battleExitTime: number;
  battleExitPrice: number;
}

const defaultState: GameState = {
  currentView: 'arena',
  arenaMode: 'PVE',
  tournament: {
    tournamentId: null,
    round: null,
    type: null,
    pair: null,
    entryFeeLp: null,
  },
  phase: 'DRAFT',
  running: false,
  matchN: 0,
  wins: 0,
  losses: 0,
  streak: 0,
  lp: 2340,
  score: 74,
  timer: 0,
  speed: 3,
  inLobby: true,
  selectedAgents: [],
  pos: null,
  hypothesis: null,
  battleResult: null,
  battleCandlesSinceEntry: 0,
  chartPattern: null,
  opponent: null,
  orpoOutput: null,
  ctxBeliefs: [],
  commanderVerdict: null,
  guardianCheck: null,
  fbScore: null,
  squadConfig: { riskLevel: 'mid', timeframe: '4h', leverageBias: 5, confidenceWeight: 5 },
  pendingAction: null,
  prices: { BTC: 97420, ETH: 3481, SOL: 198.46 },
  bases: { BTC: 97420, ETH: 3481, SOL: 198.46 },
  pair: 'BTC/USDT',
  timeframe: '4h',
  arenaView: 'arena',
  battleTick: null,
  battlePriceHistory: [],
  battleEntryTime: 0,
  battleExitTime: 0,
  battleExitPrice: 0,
};

// Load from localStorage
function loadState(): GameState {
  const parsed = loadFromStorage<Partial<GameState> | null>(STORAGE_KEYS.gameState, null);
  if (!parsed) return defaultState;

  const squadConfig = parsed?.squadConfig
    ? { ...defaultState.squadConfig, ...parsed.squadConfig, timeframe: normalizeTimeframe(parsed.squadConfig.timeframe) }
    : defaultState.squadConfig;

  return {
    ...defaultState,
    ...parsed,
    arenaMode: parsed?.arenaMode === 'PVP' || parsed?.arenaMode === 'TOURNAMENT' ? parsed.arenaMode : 'PVE',
    tournament: {
      ...defaultState.tournament,
      ...(parsed?.tournament ?? {}),
    },
    squadConfig,
    timeframe: normalizeTimeframe(parsed?.timeframe),
    running: false,
    phase: 'DRAFT',
    inLobby: true
  };
}

export const gameState = writable<GameState>(loadState());

// S-03: priceStore → gameState.prices 자동 동기화 (단일 소스)
// +layout.svelte의 이중 쓰기를 제거하고 여기서 중앙 관리한다.
if (typeof window !== 'undefined') {
  derived(
    [btcPrice, ethPrice, solPrice],
    ([$btc, $eth, $sol]) => ({ BTC: $btc, ETH: $eth, SOL: $sol })
  ).subscribe(p => {
    gameState.update(s => {
      const nextBtc = p.BTC || s.prices.BTC;
      const nextEth = p.ETH || s.prices.ETH;
      const nextSol = p.SOL || s.prices.SOL;
      if (s.prices.BTC === nextBtc && s.prices.ETH === nextEth && s.prices.SOL === nextSol) return s;
      return { ...s, prices: { BTC: nextBtc, ETH: nextEth, SOL: nextSol } };
    });
  });
}

// Auto-save persistent fields (excludes prices, phase, running, pos — transient fields)
autoSave(gameState, STORAGE_KEYS.gameState, (s) => ({
  arenaMode: s.arenaMode,
  tournament: s.tournament,
  matchN: s.matchN,
  wins: s.wins,
  losses: s.losses,
  streak: s.streak,
  lp: s.lp,
  speed: s.speed,
  selectedAgents: s.selectedAgents,
  pair: s.pair,
  timeframe: s.timeframe,
  squadConfig: s.squadConfig,
  arenaView: s.arenaView
}), 1000);

// Derived stores for convenience
export const currentView = derived(gameState, $s => $s.currentView);
export const isRunning = derived(gameState, $s => $s.running);
export const currentPhase = derived(gameState, $s => $s.phase);
export const prices = derived(gameState, $s => $s.prices);

// Helpers
export function setView(view: ViewMode) {
  gameState.update(s => ({ ...s, currentView: view }));
}

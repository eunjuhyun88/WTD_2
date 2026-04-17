import type { BinanceKline } from './marketContext';

export type MarketState = 'trend_up' | 'trend_down' | 'range' | 'volatile' | 'compressed';
export type SetupType = 'breakout' | 'pullback' | 'reversal' | 'range_fade' | 'fake_breakout' | 'no_setup';
export type V4MarketRegime = 'bull' | 'bear' | 'sideways' | 'extreme_vol';
export type ArchetypeId = 'CRUSHER' | 'RIDER' | 'ORACLE' | 'GUARDIAN';
export type SquadRole = 'SCOUT' | 'ANALYST' | 'RISK' | 'EXECUTOR';
export type BattleAction = 'LONG' | 'SHORT' | 'FLAT' | 'NO_TRADE';
export type BattleOutcome = 'WIN' | 'LOSS' | 'NEUTRAL';
export type MatchResult = 'WIN' | 'LOSS' | 'DRAW';
export type TrainerLabel = 'APPROVED' | 'OVERRIDDEN' | null;

export interface SignalWeights {
  cvdDivergence: number;
  fundingRate: number;
  openInterest: number;
  htfStructure: number;
}

export interface OwnedAgent {
  id: string;
  name: string;
  archetypeId: ArchetypeId;
  squadRole: SquadRole;
  stage: number;
  bond: number;
  level: number;
  version: number;
  loadout: {
    signalWeights: SignalWeights;
    [key: string]: unknown;
  };
  record: {
    currentHealth: number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface OIRecord {
  timestamp: number;
  openInterest: number;
  delta: number;
}

export interface FundingRecord {
  timestamp: number;
  fundingRate: number;
}

export interface LSRecord {
  timestamp: number;
  longRatio: number;
  shortRatio: number;
}

export interface BattleScenario {
  id: string;
  label: string;
  candles: BinanceKline[];
  oiHistory: OIRecord[];
  fundingHistory: FundingRecord[];
  lsRatioHistory: LSRecord[];
  startTimestamp: number;
  endTimestamp: number;
}

export interface SignalSnapshot {
  symbol: string;
  timestamp: number;
  cvd1h: number;
  cvdDivergence: boolean;
  fundingRate: number;
  fundingLabel: 'OVERHEAT_LONG' | 'OVERHEAT_SHORT' | 'NEUTRAL';
  oiChange1h: number;
  primaryZone: string;
  modifiers: string[];
  [key: string]: unknown;
}

export interface MarketFrame {
  price: number;
  priceDelta: number;
  regime: V4MarketRegime;
  [key: string]: unknown;
}

export interface StageFrame {
  verticalBias: number;
  predatorZones: unknown[];
  zoneControlScore: number;
  [key: string]: unknown;
}

export interface L0Context {
  regime: V4MarketRegime;
  price: number;
  priceDelta: number;
  cvdState: 'BULLISH' | 'BEARISH' | 'DIVERGING' | 'NEUTRAL';
  fundingRate: number;
  fundingLabel: 'OVERHEAT_LONG' | 'OVERHEAT_SHORT' | 'NEUTRAL';
  oiChange1h: number;
  primaryZone: string;
  modifiers: string[];
  verticalBias: number;
  predatorNear: boolean;
  zoneControl: number;
  health: number;
  bond: number;
  stage: number;
}

export type MemoryKind =
  | 'SUCCESS_CASE'
  | 'FAILURE_CASE'
  | 'PLAYBOOK'
  | 'MATCH_SUMMARY'
  | 'USER_NOTE'
  | 'DOCTRINE';

export interface MemoryRecord {
  id: string;
  agentId: string;
  kind: MemoryKind;
  scenarioId?: string;
  symbol: string;
  regime?: string;
  primaryZone?: string;
  action?: string;
  outcome?: string;
  title: string;
  lesson: string;
  detail?: string;
  importance: number;
  successScore: number;
  retrievalCount: number;
  compactionLevel: number;
  isDoctrineCard: boolean;
  score?: number;
  createdAt: number;
  updatedAt: number;
}

export interface RetrievalQuery {
  regime: string;
  cvdSign: 'DIVERGE' | 'ALIGN';
  fundingZone: 'OVERHEAT' | 'UNDERHEAT' | 'NEUTRAL';
  primaryZone: string;
  agentRole: ArchetypeId;
}

export interface AgentDecisionTrace {
  action: BattleAction;
  confidence: number;
  thesis: string;
  invalidation: string;
  evidenceTitles: string[];
  riskFlags: string[];
  memoryIdsUsed: string[];
  fallbackUsed: boolean;
  fallbackReason?: string;
  providerLabel: string;
  durationMs?: number;
  tokenCount?: number;
}

export interface OrpoPairSource {
  agentId: string;
  scenarioId: string;
  tick: number;
  signal: SignalSnapshot;
  market: MarketFrame;
  memories: MemoryRecord[];
  assembledContext: string;
  agentTrace: AgentDecisionTrace;
  trainerLabel: TrainerLabel;
  trainerAction?: BattleAction;
  outcome: BattleOutcome;
  matchOutcome?: MatchResult;
}

export interface OrpoV2Pair {
  id: string;
  agentId: string;
  scenarioId?: string;
  tick?: number;
  contextPrompt: string;
  chosenResponse: AgentDecisionTrace;
  rejectedResponse: AgentDecisionTrace;
  qualityWeight: number;
  trainerLabel: TrainerLabel;
  battleOutcome: string;
  createdAt: number;
}

export interface BattleTickState {
  matchResult?: MatchResult;
  tradeHistory: {
    trades: Array<{ pnlPercent?: number }>;
    totalPnl: number;
    tradeCount: number;
    winCount: number;
    lossCount: number;
  };
  stage: {
    zoneControlScore: number;
    [key: string]: unknown;
  };
  events: Array<{ detail?: string }>;
  [key: string]: unknown;
}

export const V4_CONFIG = {
  AUTO_SL_PERCENT: 0.05,
  ORPO_MIN_PAIRS: 20,
  ORPO_MIN_QUALITY: 0.5,
} as const;

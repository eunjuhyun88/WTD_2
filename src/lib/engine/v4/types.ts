// ═══════════════════════════════════════════════════════════════
// COGOCHI — Battle Engine v4 Core Types
// Design source: Cogochi_BattleStateMachine_20260322.md
//                Cogochi_AgentDecisionPipeline_20260322.md
//                Cogochi_MemorySystemDesign_20260322.md
// ═══════════════════════════════════════════════════════════════

import type { BinanceKline, FactorResult } from '../types.js';

// Re-define MarketRegime locally to match Cogochi semantics
// (differs from engine/types.ts which uses 'trending_up' etc.)
export type V4MarketRegime = 'bull' | 'bear' | 'sideways' | 'extreme_vol';

// ─── Battle State Machine ──────────────────────────────────────

export type BattleStateKind =
  | 'OBSERVE'
  | 'RETRIEVE'
  | 'REASON'
  | 'DEBATE'
  | 'DECIDE'
  | 'RESOLVE'
  | 'REFLECT';

export type BattleAction = 'LONG' | 'SHORT' | 'FLAT';
export type BattleOutcome = 'WIN' | 'LOSS' | 'NEUTRAL';
export type MatchResult = 'WIN' | 'LOSS' | 'DRAW';
export type TrainerLabel = 'APPROVED' | 'OVERRIDDEN' | null;

export type BattleActionKind =
  | 'SHORT_SLAM'
  | 'LONG_PUSH'
  | 'SONAR_SCAN'
  | 'DEFEND'
  | 'BREAK_WALL'
  | 'CRUSH_SUPPORT'
  | 'LAY_TRAP'
  | 'HOLD';

// ─── Agent Archetypes ──────────────────────────────────────────

export type ArchetypeId = 'CRUSHER' | 'RIDER' | 'ORACLE' | 'GUARDIAN';

export type SquadRole = 'SCOUT' | 'ANALYST' | 'RISK' | 'EXECUTOR';

export interface OwnedAgent {
  id: string;
  name: string;
  archetypeId: ArchetypeId;
  squadRole: SquadRole;
  stage: number;           // 0~3
  bond: number;            // 0~100
  level: number;           // 1+
  version: number;         // model version (v0, v1, v2...)

  loadout: AgentLoadout;
  record: AgentRecord;
}

export interface AgentLoadout {
  systemPrompt: string;
  rolePrompt: string;
  riskStyle: 'conservative' | 'moderate' | 'aggressive';
  horizon: 'scalp' | 'swing' | 'position';
  enabledDataSources: string[];
  signalWeights: SignalWeights;
  retrievalPolicy: RetrievalPolicy;
}

export interface SignalWeights {
  cvdDivergence: number;    // 0~1
  fundingRate: number;      // 0~1
  openInterest: number;     // 0~1
  htfStructure: number;     // 0~1
}

export interface RetrievalPolicy {
  minDoctrineCards: number;  // default 1
  minFailureCards: number;   // default 1 (for RISK role)
  maxTotalCards: number;     // default 5
}

export interface AgentRecord {
  currentHealth: number;    // 0~1
  totalBattles: number;
  wins: number;
  losses: number;
  currentStreak: number;
  xp: number;
}

// ─── Signal & Market ───────────────────────────────────────────

export interface SignalSnapshot {
  symbol: string;
  timestamp: number;

  // CVD
  cvd1h: number;
  cvdDivergence: boolean;
  cvdDivergenceType?: 'bullish' | 'bearish';

  // Funding
  fundingRate: number;
  fundingLabel: 'OVERHEAT_LONG' | 'OVERHEAT_SHORT' | 'NEUTRAL';

  // OI
  oiChange1h: number;
  oiTrend: 'RISING' | 'FALLING' | 'FLAT';

  // HTF Structure
  htfStructure: 'UPTREND' | 'DOWNTREND' | 'RANGE';
  primaryZone: string;       // e.g. "ACCUMULATION", "DISTRIBUTION"

  // Modifiers
  modifiers: string[];       // e.g. ["VOLUME_SPIKE", "LIQUIDATION_CASCADE"]
  dataQuality: 'FULL' | 'PARTIAL';

  // Raw factors (for downstream)
  factors?: FactorResult[];
}

export interface MarketFrame {
  price: number;
  priceDelta: number;        // % change since last tick
  regime: V4MarketRegime;
  fundingBias: number;       // raw funding rate
  volumeImpulse: number;     // 0~1 normalized volume
  volatility: number;        // ATR-based
}

export interface StageFrame {
  verticalBias: number;      // -1 to +1 (negative = bearish)
  capturedZones: string[];
  zoneControlScore: number;  // 0~1
  supportIntegrity: number;  // 0~1
  predatorZones: PredatorZone[];
  breakoutGateActive: boolean;
  tick: number;
}

export interface PredatorZone {
  id: string;
  priceLevel: number;
  type: 'liquidation_cluster' | 'whale_order' | 'stop_hunt';
  active: boolean;
}

// ─── Scenario ──────────────────────────────────────────────────

export interface ScenarioFrame {
  id: string;
  label: string;             // e.g. "FTX Collapse 2022-11-09"
  startTimestamp: number;
  endTimestamp: number;
  tickCount: number;
  tick: number;
  round: number;             // 1~3
  totalRounds: number;
  objectiveLabel: string;
  objectiveThreshold: number;
  objectiveProgress: number;
  tickLimit: number;
  symbol: string;
  signalDataHash?: string;   // for on-chain commit
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

// ─── Agent Decision Trace ──────────────────────────────────────

export interface AgentDecisionTrace {
  action: BattleAction;
  confidence: number;        // 0~1
  thesis: string;            // max 50 chars
  invalidation: string;
  evidenceTitles: string[];
  riskFlags: string[];
  memoryIdsUsed: string[];

  // Metadata
  fallbackUsed: boolean;
  fallbackReason?: string;
  providerLabel: string;     // e.g. 'groq:llama-3.3-70b' or 'fallback:heuristic'
  durationMs?: number;
  tokenCount?: number;
}

export const FLAT_FALLBACK: AgentDecisionTrace = {
  action: 'FLAT',
  confidence: 0.5,
  thesis: 'FALLBACK — AI unavailable',
  invalidation: '',
  evidenceTitles: [],
  riskFlags: [],
  memoryIdsUsed: [],
  fallbackUsed: true,
  fallbackReason: 'unknown',
  providerLabel: 'fallback:flat',
};

// ─── Veto & Consensus ──────────────────────────────────────────

export interface VetoDecision {
  veto: boolean;
  reason?: string;
}

export interface SquadConsensus {
  finalAction: BattleAction;
  finalConfidence: number;
  vetoApplied: boolean;
  vetoReason?: string;
  agentAgreement: number;    // 0~1 how many agents agree
}

// ─── Position (real trading — no fixed TP/SL) ──────────────────

export type PositionStatus = 'OPEN' | 'CLOSED';

export type PositionAction = 'OPEN_LONG' | 'OPEN_SHORT' | 'HOLD' | 'CLOSE' | 'FLIP';

export interface Position {
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  entryTick: number;
  size: number;            // 0~1 portfolio fraction
  status: PositionStatus;
  exitPrice?: number;
  exitTick?: number;
  pnlPercent?: number;     // realized PnL % (set on close)
  unrealizedPnl?: number;  // current unrealized PnL %
}

// ─── Trade History (cumulative PnL across multiple trades) ─────

export interface TradeHistory {
  trades: Position[];       // closed trades
  totalPnl: number;         // cumulative realized PnL %
  tradeCount: number;
  winCount: number;          // profitable trades
  lossCount: number;         // losing trades
}

// ─── Game Action Plan ──────────────────────────────────────────

export interface GameActionPlan {
  primary: BattleActionKind;
  secondary?: BattleActionKind;
  power: number;
  targetZone?: string;

  // Trainer label (for ORPO learning)
  trainerLabel: TrainerLabel;
  originalConsensus?: SquadConsensus;
}

export interface PlayerIntervention {
  type: 'APPROVE' | 'OVERRIDE_LONG' | 'OVERRIDE_SHORT' | 'OVERRIDE_FLAT';
}

// ─── Battle Events ─────────────────────────────────────────────

export type BattleEventType =
  | 'ZONE_CAPTURED'
  | 'ZONE_LOST'
  | 'TRAP_CAUGHT'
  | 'PREDATOR_ACTIVATED'
  | 'VETO_FIRED'
  | 'BREAKOUT'
  | 'HEALTH_CRITICAL'
  | 'STAGE_UP';

export interface BattleEvent {
  type: BattleEventType;
  agentId?: string;
  detail?: string;
  tick: number;
}

// ─── Battle Tick State (full tick snapshot) ─────────────────────

export interface BattleTickState {
  // Identity
  scenarioId: string;
  tick: number;
  round: number;
  state: BattleStateKind;

  // Agents
  squad: OwnedAgent[];

  // Scenario data
  scenario: ScenarioFrame;
  battleScenario: BattleScenario;

  // Position + Trade History (real PnL tracking)
  position?: Position;
  tradeHistory: TradeHistory;
  positionAction?: PositionAction;

  // OBSERVE output
  signal?: SignalSnapshot;
  stage: StageFrame;
  market?: MarketFrame;

  // RETRIEVE output
  memoriesByAgent?: Record<string, MemoryRecord[]>;
  retrievalMeta?: Record<string, RetrievalMeta>;

  // REASON output
  rawTraces?: Record<string, string>;
  callMeta?: Record<string, CallMeta>;

  // DEBATE output
  traces?: Record<string, AgentDecisionTrace>;
  vetoDecision?: VetoDecision;
  consensus?: SquadConsensus;

  // DECIDE output
  plan?: GameActionPlan;
  playerIntervention?: PlayerIntervention;

  // RESOLVE output
  outcome?: BattleOutcome;
  matchResult?: MatchResult;
  events: BattleEvent[];
  xpGained?: number;

  // REFLECT output
  memoryCards?: MemoryRecord[];
  reflection?: string;
  bondDelta?: number;
  orpoQueued?: boolean;

  // Timing
  startedAt: number;
  completedAt?: number;
}

export interface RetrievalMeta {
  hitCount: number;
  topScore: number;
  doctrineFound: boolean;
}

export interface CallMeta {
  durationMs: number;
  tokenCount: number;
  fallbackUsed: boolean;
}

// ─── Memory System ─────────────────────────────────────────────

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

  // Context tags
  symbol: string;
  regime?: string;
  primaryZone?: string;
  action?: string;
  outcome?: string;

  // Content
  title: string;            // max 30 chars
  lesson: string;           // max 50 chars
  detail?: string;          // max 500 chars

  // Metadata
  importance: number;        // 0~1
  successScore: number;      // -1 to +1 (WIN=+1, LOSS=-1, NEUTRAL=0)
  retrievalCount: number;
  compactionLevel: number;   // 0=raw, 1=compacted, 2=highly_compacted
  isDoctrineCard: boolean;

  // Retrieval scoring
  score?: number;            // computed during RETRIEVE

  createdAt: number;
  updatedAt: number;
}

// ─── L0 Context (always loaded) ────────────────────────────────

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

  // Stage
  verticalBias: number;
  predatorNear: boolean;
  zoneControl: number;

  // Agent self
  health: number;
  bond: number;
  stage: number;
}

// ─── ORPO Pair ─────────────────────────────────────────────────

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

// ─── Retrieval Query ───────────────────────────────────────────

export interface RetrievalQuery {
  regime: string;
  cvdSign: 'DIVERGE' | 'ALIGN';
  fundingZone: 'OVERHEAT' | 'UNDERHEAT' | 'NEUTRAL';
  primaryZone: string;
  agentRole: ArchetypeId;
}

// ─── Context Assembly ──────────────────────────────────────────

export interface ContextAssemblyInput {
  agent: OwnedAgent;
  signal: SignalSnapshot;
  market: MarketFrame;
  stage: StageFrame;
  scenario: ScenarioFrame;
  memories: MemoryRecord[];
  squadNotes: string[];
}

// ─── Config ────────────────────────────────────────────────────

export const V4_CONFIG = {
  // RETRIEVE
  RETRIEVE_TIMEOUT_MS: 200,
  RETRIEVE_TOP_K: 5,

  // REASON
  REASON_TIMEOUT_MS: 5000,
  REASON_TOKEN_BUDGET: 2000,
  REASON_TEMPERATURE: 0.1,
  REASON_MAX_PREDICT: 256,

  // POSITION (real trading — agent decides when to close)
  AUTO_SL_PERCENT: 0.05,           // individual position auto-stop at -5%
  MAX_DRAWDOWN_PERCENT: 0.15,      // cumulative -15% → battle LOSS
  PROFIT_TARGET_PERCENT: 0.10,     // cumulative +10% → battle WIN
  POSITION_SIZE: 0.5,              // 50% of portfolio per trade

  // RESOLVE
  NEUTRAL_PRICE_THRESHOLD: 0.001,  // ±0.1% is NEUTRAL (tighter = more WIN/LOSS, fewer NEUTRAL)

  // Stage modifiers (higher = faster zone capture)
  STAGE_POWER_MULTIPLIER: [0.8, 1.0, 1.4, 2.0] as readonly number[],

  // Memory
  MEMORY_MAX_PER_AGENT: 100,
  MEMORY_COMPACTION_THRESHOLD: 80,

  // ORPO
  ORPO_MIN_PAIRS: 20,
  ORPO_MIN_QUALITY: 0.5,
} as const;

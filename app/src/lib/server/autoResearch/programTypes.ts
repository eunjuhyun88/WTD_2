// ═══════════════════════════════════════════════════════════════
// COGOCHI — AutoResearch Program Types
// Defines the structure for research programs (program.md format).
// A program declares WHAT to optimize, HOW to search, and
// WHEN to keep/discard results.
//
// Design principle: same engine for devs and users.
//   Dev: npm run research:optimize -- --program programs/base-params.md
//   User: Terminal > Train > Auto-Optimize (UI generates program)
// ═══════════════════════════════════════════════════════════════

import type { ArchetypeId, MarketState, SetupType } from '$lib/contracts/researchV4';

// ─── Research Program ──────────────────────────────────────────

/** A research program is a declarative spec for parameter optimization */
export interface ResearchProgram {
  /** Program metadata */
  meta: ProgramMeta;
  /** What parameters to tune, with bounds */
  parameters: ParameterSpec[];
  /** Which scenarios to test on */
  scenarios: ScenarioSpec;
  /** How to evaluate results */
  objective: ObjectiveSpec;
  /** When to accept/reject a candidate */
  acceptance: AcceptanceCriteria;
  /** Search strategy */
  search: SearchSpec;
}

export interface ProgramMeta {
  id: string;
  name: string;
  description: string;
  version: number;
  author: 'system' | 'user';
  createdAt: number;
  /** Target archetype (or 'all') */
  archetype: ArchetypeId | 'all';
  /** Optional: only optimize for specific regimes */
  regimeFilter?: MarketState[];
}

// ─── Parameter Spec ────────────────────────────────────────────

export interface ParameterSpec {
  /** Parameter key path (e.g. 'ABSTAIN_CONFIDENCE_THRESHOLD') */
  key: string;
  /** Where this parameter lives in code */
  source: 'V4_CONFIG' | 'signalWeights' | 'heuristic';
  /** Human-readable name */
  label: string;
  /** Data type */
  type: 'float' | 'int' | 'boolean';
  /** Current value */
  current: number;
  /** Search range [min, max] */
  range: [number, number];
  /** Step size for grid/hill climbing */
  step: number;
  /** Is this parameter actively being tuned? */
  active: boolean;
}

/** Pre-defined parameter catalogs */
export const TUNABLE_PARAMS: ParameterSpec[] = [
  // Abstain Gate
  {
    key: 'ABSTAIN_CONFIDENCE_THRESHOLD',
    source: 'V4_CONFIG',
    label: 'Abstain confidence threshold',
    type: 'float',
    current: 0.45,
    range: [0.3, 0.7],
    step: 0.05,
    active: true,
  },
  {
    key: 'ABSTAIN_RISK_THRESHOLD',
    source: 'V4_CONFIG',
    label: 'Abstain risk threshold',
    type: 'float',
    current: 0.7,
    range: [0.5, 0.9],
    step: 0.05,
    active: true,
  },
  // Position management
  {
    key: 'AUTO_SL_PERCENT',
    source: 'V4_CONFIG',
    label: 'Auto stop-loss %',
    type: 'float',
    current: 0.05,
    range: [0.02, 0.10],
    step: 0.01,
    active: true,
  },
  {
    key: 'POSITION_SIZE',
    source: 'V4_CONFIG',
    label: 'Position size (portfolio %)',
    type: 'float',
    current: 0.5,
    range: [0.1, 1.0],
    step: 0.1,
    active: false,
  },
  // Signal weights
  {
    key: 'cvdDivergence',
    source: 'signalWeights',
    label: 'CVD divergence weight',
    type: 'float',
    current: 0.5,
    range: [0.1, 1.0],
    step: 0.1,
    active: true,
  },
  {
    key: 'fundingRate',
    source: 'signalWeights',
    label: 'Funding rate weight',
    type: 'float',
    current: 0.5,
    range: [0.1, 1.0],
    step: 0.1,
    active: true,
  },
  {
    key: 'openInterest',
    source: 'signalWeights',
    label: 'Open interest weight',
    type: 'float',
    current: 0.5,
    range: [0.1, 1.0],
    step: 0.1,
    active: true,
  },
  {
    key: 'htfStructure',
    source: 'signalWeights',
    label: 'HTF structure weight',
    type: 'float',
    current: 0.5,
    range: [0.1, 1.0],
    step: 0.1,
    active: true,
  },
];

// ─── Scenario Spec ─────────────────────────────────────────────

export interface ScenarioSpec {
  /** Use specific scenario IDs from catalog */
  scenarioIds?: string[];
  /** Or generate scenarios matching criteria */
  filter?: {
    symbols?: string[];
    intervals?: string[];
    regimes?: MarketState[];
    minCandles?: number;
  };
  /** How many scenarios per evaluation round */
  scenariosPerRound: number;
}

// ─── Objective Spec ────────────────────────────────────────────

export type MetricName =
  | 'winRate'
  | 'totalPnl'
  | 'sharpe'
  | 'maxDrawdown'
  | 'noTradePrecision'
  | 'avgRMultiple'
  | 'compositeScore';

export interface ObjectiveSpec {
  /** Primary metric to optimize */
  primary: MetricName;
  /** Direction: maximize or minimize */
  direction: 'maximize' | 'minimize';
  /** Secondary constraints (hard limits) */
  constraints?: MetricConstraint[];
  /** Composite weights (if primary = 'compositeScore') */
  compositeWeights?: {
    winRate: number;
    pnl: number;
    sharpe: number;
    noTrade: number;
  };
}

export interface MetricConstraint {
  metric: MetricName;
  operator: 'gte' | 'lte' | 'gt' | 'lt';
  value: number;
}

// ─── Acceptance Criteria ───────────────────────────────────────

export interface AcceptanceCriteria {
  /** Max degradation from IS to OOS (e.g. 0.15 = 15%) */
  maxDegradation: number;
  /** Minimum OOS performance (absolute) */
  minOOSMetric?: { metric: MetricName; value: number };
  /** IS/OOS split ratio */
  splitRatio: number;
  /** Must beat baseline by this margin */
  minImprovement: number;
}

// ─── Search Spec ───────────────────────────────────────────────

export interface SearchSpec {
  /** Search strategy */
  strategy: 'hill_climbing' | 'grid_search' | 'random' | 'bayesian';
  /** Number of optimization rounds */
  maxRounds: number;
  /** Max time budget in seconds */
  maxTimeSeconds: number;
  /** Early stop if no improvement for N rounds */
  earlyStopPatience: number;
  /** Number of parallel candidates per round (for random/bayesian) */
  candidatesPerRound?: number;
}

// ─── Research Result ───────────────────────────────────────────

export interface ResearchResult {
  programId: string;
  status: 'completed' | 'early_stopped' | 'timeout' | 'failed';
  rounds: number;
  elapsedMs: number;

  /** Best parameters found */
  bestParams: Record<string, number>;
  /** IS metrics for best params */
  isMetrics: Record<MetricName, number>;
  /** OOS metrics for best params */
  oosMetrics: Record<MetricName, number>;
  /** IS→OOS degradation */
  degradation: number;

  /** Did it pass acceptance criteria? */
  accepted: boolean;
  rejectReason?: string;

  /** Full search history */
  history: SearchHistoryEntry[];
}

export interface SearchHistoryEntry {
  round: number;
  params: Record<string, number>;
  score: number;
  improved: boolean;
}

/**
 * Evaluation harness contracts.
 *
 * The research spine's comparison layer lives here. These types are what
 * every agent / baseline / learned policy must agree on so that the same
 * harness can run any pair of them on the same trajectory slice.
 *
 * Design rules:
 *  - No zod runtime validation here. These are structural types only —
 *    the boundary schemas live in `$lib/contracts`. This file is the
 *    "engineer's interface", not the "DB's interface".
 *  - No I/O, no clock reads, no randomness. All state is explicit.
 *  - Every value that could be surprising is a branded type so mixing
 *    up a "per-pair utility" with a "per-trajectory utility" is a
 *    type error at compile time.
 *
 * Reference:
 *   `research/evals/rq-b-baseline-protocol.md`
 */

import type {
	VerdictBlock,
	DecisionTrajectory,
	Decision,
	DecisionAction
} from '../../contracts/index';

// ---------------------------------------------------------------------------
// AgentPolicy — the contract every baseline AND every learned agent satisfies
// ---------------------------------------------------------------------------

/**
 * A policy is a pure function from observation (VerdictBlock) to a
 * proposed decision. `context` carries everything the policy may legitimately
 * condition on beyond the verdict itself (actor identity, previous decisions,
 * budget constraints). If the policy needs market data that is NOT in the
 * verdict_block, it is violating the authority chain and must be rewritten.
 */
export interface AgentPolicy {
	/** Stable identifier — used in reports, must not change across versions. */
	readonly id: string;

	/** Human-readable name for dashboards. */
	readonly label: string;

	/** Monotonically increasing version identifier for ORPO training runs. */
	readonly version: string;

	/**
	 * Whether this policy is deterministic. Deterministic policies must
	 * return the same decision for the same `(verdict, context)` input.
	 * Non-deterministic policies (Random, stochastic LLM) must accept a
	 * seed via `context.seed` for reproducibility.
	 */
	readonly deterministic: boolean;

	/** Core decision function. Pure; must not touch network or clock. */
	decide(observation: AgentObservation): AgentDecisionProposal;
}

export interface AgentObservation {
	/** The frozen verdict block produced by the engine. */
	readonly verdict: VerdictBlock;

	/** Optional session context — seed for stochastic policies, budget, etc. */
	readonly context: AgentContext;
}

export interface AgentContext {
	/** RNG seed for stochastic policies. Policies should not read from a global RNG. */
	readonly seed?: number;

	/**
	 * Optional user-provided constraints the policy must respect. These are
	 * soft guidance; hard constraints are enforced by the server risk gate.
	 */
	readonly maxLeverage?: number;
	readonly maxPositionPct?: number;

	/**
	 * Previous decisions for this actor within the same session. Enables
	 * "don't chase" style policies and is what makes HumanDecisionAgent
	 * useful as a replay baseline.
	 */
	readonly priorDecisions?: ReadonlyArray<Decision>;
}

/**
 * A proposed decision. Not the same as a `Decision` in `$lib/contracts` —
 * the contract-level `Decision` is the stored row (with actor + final
 * sizing). This is the policy's raw proposal; the harness wraps it with
 * actor metadata and risk-gate overrides before storing as a trajectory.
 */
export interface AgentDecisionProposal {
	readonly action: DecisionAction;
	readonly size_pct: number | null;
	readonly leverage: number | null;
	readonly stop_price: number | null;
	readonly tp_prices: readonly number[];
	readonly note: string | null;
	/**
	 * Free-form rationale the policy wants to attach. For ORPO training
	 * this becomes the explanation half of the response contract.
	 */
	readonly rationale: string | null;
}

// ---------------------------------------------------------------------------
// TrajectorySlice — the unit of comparison
// ---------------------------------------------------------------------------
//
// A slice is a contiguous chunk of resolved trajectories, tagged with
// provenance and regime. The walk-forward splitter turns a raw
// DecisionTrajectory stream into a sequence of slices.

export type Regime = 'trend' | 'range' | 'high_vol' | 'unknown';

/** A branded string so we can't mix slice IDs with arbitrary strings. */
export type SliceId = string & { readonly __brand: 'SliceId' };

export interface TrajectorySlice {
	readonly id: SliceId;
	/** Human-readable fold label, e.g. "fold-03/train" or "fold-03/test". */
	readonly label: string;
	readonly startAt: string; // ISO-8601
	readonly endAt: string; // ISO-8601
	readonly regime: Regime | 'mixed';
	/**
	 * The trajectory rows this slice references. Only rows with
	 * `outcome.resolved === true` should be included — a slice with
	 * unresolved outcomes cannot be used for evaluation.
	 */
	readonly trajectories: ReadonlyArray<DecisionTrajectory>;
}

// ---------------------------------------------------------------------------
// UtilityMetrics — what every comparison produces
// ---------------------------------------------------------------------------

export interface UtilityMetrics {
	/** Mean utility across the slice. */
	readonly utilityMean: number;
	/** Std dev of per-trajectory utility. */
	readonly utilityStd: number;
	/** Median utility. */
	readonly utilityMedian: number;

	/** Sharpe ratio of per-trajectory returns (pnl_bps / 10000). */
	readonly sharpe: number;
	/** Sortino ratio. */
	readonly sortino: number;
	/** Max drawdown as a non-negative fraction of peak equity. */
	readonly maxDrawdown: number;
	/** Hit rate — fraction of trajectories with positive pnl. */
	readonly hitRate: number;
	/** Total rule violations encountered across the slice. */
	readonly ruleViolations: number;
	/** Count of trajectories that flipped p0_violation = true. */
	readonly p0Violations: number;
	/** Number of trajectories included in the calculation. */
	readonly sampleSize: number;
}

// ---------------------------------------------------------------------------
// ComparisonResult — the paired comparison output
// ---------------------------------------------------------------------------

export interface ComparisonResult {
	readonly sliceId: SliceId;
	readonly regime: Regime | 'mixed';

	readonly agentA: {
		readonly id: string;
		readonly metrics: UtilityMetrics;
	};
	readonly agentB: {
		readonly id: string;
		readonly metrics: UtilityMetrics;
	};

	/** Paired-bootstrap CI on utility(A) - utility(B). */
	readonly diffMeanUtility: number;
	readonly ci95: readonly [number, number];
	readonly pValue: number;
	readonly cohenD: number;

	/**
	 * `true` when the 95% CI excludes zero — the comparison has
	 * statistically significant sign at the 5% level.
	 */
	readonly significant: boolean;

	/**
	 * Non-overlapping winner, if one exists:
	 *   'A' — agent A wins with significance
	 *   'B' — agent B wins with significance
	 *   'tie' — CI includes zero, no significant winner
	 */
	readonly winner: 'A' | 'B' | 'tie';
}

// ---------------------------------------------------------------------------
// AblationCell — one row of an ablation table
// ---------------------------------------------------------------------------
//
// Used by R7 to attribute utility gains to individual components
// (engine only → +zero-shot LLM → +SFT → +ORPO). Each cell names the
// configuration and its metrics against a common slice.

export interface AblationCell {
	readonly label: string;
	readonly configuration: ReadonlyArray<string>;
	readonly metrics: UtilityMetrics;
	/** Delta vs. the previous cell in the ablation chain. */
	readonly deltaUtilityMean: number;
	/** CI on that delta. */
	readonly deltaCi95: readonly [number, number];
}

// ---------------------------------------------------------------------------
// RegimeReport — per-regime breakdown for a single agent
// ---------------------------------------------------------------------------

export interface RegimeReport {
	readonly agentId: string;
	readonly overall: UtilityMetrics;
	readonly byRegime: Readonly<Record<Regime, UtilityMetrics | null>>;
}

// ---------------------------------------------------------------------------
// WalkForwardFold — one (train, test) pair from a walk-forward split
// ---------------------------------------------------------------------------

export interface WalkForwardFold {
	readonly foldIndex: number;
	readonly train: TrajectorySlice;
	readonly test: TrajectorySlice;
}

// ---------------------------------------------------------------------------
// Utility — policy-agnostic pnl → utility mapping
// ---------------------------------------------------------------------------
//
// The utility function is a first-class research parameter. R3 (reward
// sensitivity) will sweep these weights, so the eval harness never
// hardcodes them.

export interface UtilityWeights {
	/** Linear coefficient on pnl_bps. Usually `1`. */
	readonly pnl: number;
	/** Penalty coefficient on max_drawdown_bps. */
	readonly drawdown: number;
	/** Penalty per rule violation. */
	readonly violation: number;
	/** Reward for directional hit. */
	readonly directionHit: number;
	/** Penalty on slippage_bps. */
	readonly slippage: number;
}

/** Canonical weights from ORPO_DATA_SCHEMA_PIPELINE_v1 §4.2. */
export const ORPO_CANONICAL_WEIGHTS: UtilityWeights = {
	pnl: 1,
	drawdown: 1.5,
	violation: 2,
	directionHit: 0.6,
	slippage: 0.3
};

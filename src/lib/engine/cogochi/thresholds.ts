/**
 * `thresholds` — central registry of engine magic numbers. E6 of the
 * harness engine integration plan.
 *
 * Every hard-coded threshold inside the cogochi layer engine is being
 * lifted into this file in slices, one layer at a time. The first
 * sub-slice (E6a) lifts L2 flow thresholds. Subsequent E6b..N
 * sub-slices add L4 (OB), L6 (on-chain), L7 (F&G), L8 (kimchi), etc.
 *
 * Design rules:
 *   - **Frozen at module load.** Every namespace is `Object.freeze`d
 *     so accidental mutation throws in strict mode. The constants
 *     are also `as const` so the type-level shape locks in.
 *   - **One source of truth.** Once a constant lives here, the
 *     corresponding inline literal in `layerEngine.ts` (or any
 *     `layers/*.ts` file) must reference this registry. Editor-search
 *     for the named key is the way to find every consumer.
 *   - **Versioned at the top.** `ENGINE_THRESHOLDS_VERSION` lets the
 *     registry bump independently of contracts; if a future slice
 *     changes a value, the version flips and downstream snapshots
 *     can detect drift.
 *   - **Aligned with the dissection ledger.** Every key carries a
 *     `dissection §4.x line N` reference in its doc comment so the
 *     ledger and the code stay anchored to each other. If a value
 *     changes here, update the dissection ledger in the same diff.
 *   - **No imports from `$lib/contracts` or anywhere else.** This
 *     file is leaf — pure constants. Importing anything would risk
 *     a circular dependency through `layerEngine.ts → thresholds →
 *     contracts → events → ...`.
 *
 * Reference:
 *   docs/exec-plans/active/harness-engine-integration-plan-2026-04-11.md §3 E6
 *   docs/exec-plans/active/alpha-terminal-harness-html-dissection-2026-04-10.md §4
 */

/**
 * Bumps when any value in this registry changes. Slice tooling
 * (research spine + smoke snapshots) can record the version it
 * was built against and refuse to compare across versions.
 */
export const ENGINE_THRESHOLDS_VERSION = 'engine-thresholds-v1' as const;
export type EngineThresholdsVersion = typeof ENGINE_THRESHOLDS_VERSION;

// ---------------------------------------------------------------------------
// L2 — Flow (FR + OI + L/S + Taker)
// Source: dissection §4.2 lines 1010-1038
// Layer file: src/lib/engine/cogochi/layerEngine.ts:computeL2
// ---------------------------------------------------------------------------

/**
 * Funding-rate, OI/price synergy, long-short ratio, and taker-flow
 * band thresholds for `computeL2`. Every value here is referenced
 * by exactly one branch in `layerEngine.ts:computeL2` and by
 * `e3a-l2-flow-events-smoke.ts` for event-emission validation.
 *
 * The score-cap pair (`score_clip_min` / `score_clip_max`) is kept
 * here even though dissection §4.2 marks it "compat only" — the
 * existing legacy alpha aggregator still relies on the cap, and
 * holding the value in the registry is cheaper than deleting it
 * across two consumers.
 */
export const FlowThresholds = Object.freeze({
	// FR bands — line 1010-1017
	/** `fr < -0.07` triggers `event.flow.fr_extreme_negative`. */
	fr_extreme_negative: -0.07,
	/** `fr < -0.025` is FR negative (no event, scoring only). */
	fr_negative: -0.025,
	/** `fr < -0.005` is FR weak negative (no event, scoring only). */
	fr_weak_negative: -0.005,
	/** `fr < 0.005` is the FR neutral upper band. */
	fr_neutral_upper: 0.005,
	/** `fr < 0.04` is FR positive (no event, scoring only). */
	fr_positive: 0.04,
	/** `fr < 0.08` is FR hot (no event, scoring only). */
	fr_hot: 0.08,
	/** `fr >= 0.08` triggers `event.flow.fr_extreme_positive`. */
	fr_extreme_positive: 0.08,

	// OI + price synergy gates — line 1019-1022
	/** `|oi_change_pct|` floor for any of the four flow events. */
	oi_build_min_pct: 3,
	/** `|price_change_pct|` floor for any of the four flow events. */
	price_build_min_pct: 0.5,

	// L/S ratio bands — line 1026-1029
	/** `lsRatio > 2.2` is extreme-long crowd (bear pressure). */
	ls_extreme_long: 2.2,
	/** `lsRatio > 1.6` is long-heavy (mild bear pressure). */
	ls_long_heavy: 1.6,
	/** `lsRatio < 0.9` is short-heavy (mild bull pressure). */
	ls_short_heavy: 0.9,
	/** `lsRatio < 0.6` is extreme-short crowd (bull pressure). */
	ls_extreme_short: 0.6,

	// Taker flow bands — line 1033-1036
	/** `takerRatio > 1.25` is aggressive buying. */
	taker_aggressive_buy: 1.25,
	/** `takerRatio > 1.08` is buy lean. */
	taker_buy_lean: 1.08,
	/** `takerRatio < 0.92` is sell lean. */
	taker_sell_lean: 0.92,
	/** `takerRatio < 0.75` is aggressive selling. */
	taker_aggressive_sell: 0.75,

	// Score cap — line 1038 (legacy compat only — replaced by structure-first verdict)
	/** Lower bound on `clamp(score, ...)` at the end of `computeL2`. */
	score_clip_min: -55,
	/** Upper bound on `clamp(score, ...)` at the end of `computeL2`. */
	score_clip_max: 55
} as const);

export type FlowThresholds = typeof FlowThresholds;

// ---------------------------------------------------------------------------
// L14 — Bollinger Band Squeeze + Expansion
// Source: dissection §4.3 lines 1437-1486
// Layer file: src/lib/engine/cogochi/layers/l14BbSqueeze.ts
// ---------------------------------------------------------------------------

/**
 * Bollinger band period, multiplier, squeeze / big-squeeze /
 * expansion ratios, plus the three data-sufficiency floors that
 * the layer derives from the period+lookback design. The
 * dissection ledger names exactly five thresholds for L14
 * (`period 20, mult 2.0; squeeze bw<bw20ago*0.65; bigSqueeze
 * bw<bw50ago*0.5; expanding *1.3`); the floors are added here
 * because they are structural consequences of those values that
 * gate which branch the layer takes, and pinning them in the
 * registry lets the smoke catch any future drift.
 *
 * Score weights and overbought / oversold band cutoffs stay
 * inline in `l14BbSqueeze.ts`. Dissection §4.3 does not list
 * them, and the structure-first verdict rewrite will replace
 * the score-weighted scoring path entirely.
 */
export const BbThresholds = Object.freeze({
	// Bollinger band parameters — line 1437-1438
	/** Bollinger band period (number of closes in the moving average). */
	bb_period: 20,
	/** Standard-deviation multiplier for the band envelope. */
	bb_std_mult: 2.0,

	// Compression / expansion ratios — line 1437
	/** `bw < bw20ago * 0.65` ⇒ squeeze. */
	bb_squeeze_ratio_20: 0.65,
	/** `bw < bw50ago * 0.5` ⇒ big squeeze (historic compression). */
	bb_big_squeeze_ratio_50: 0.5,
	/** `bw > bw20ago * 1.3` ⇒ expansion. */
	bb_expansion_ratio: 1.3,

	// Data sufficiency floors — derived from period + lookback
	/** Minimum klines before any L14 result is computed (period + buffer). */
	bb_min_klines: 25,
	/**
	 * Minimum closes length (`closes.length > N`) required for the
	 * 20-bar prior `calcBB(slice(0, -20))` to use real data instead
	 * of the current bandwidth as a fallback.
	 */
	bb_lookback_20_floor: 40,
	/**
	 * Minimum closes length required for the 50-bar prior
	 * `calcBB(slice(0, -50))`. When below the floor, big-squeeze
	 * detection short-circuits to `false`.
	 */
	bb_lookback_50_floor: 70
} as const);

export type BbThresholds = typeof BbThresholds;

// ---------------------------------------------------------------------------
// Top-level registry barrel
// ---------------------------------------------------------------------------

/**
 * Single import surface for every thresholds namespace. Layer files
 * grab `Thresholds.flow.fr_extreme_negative` instead of the raw
 * literal so the dependency graph stays a single arrow into this
 * file.
 *
 * Sub-slice progression:
 *   - E6a (merged) — `Thresholds.flow` (L2)
 *   - E6b (this slice) — `Thresholds.bb` (L14)
 *   - E6c..N — `Thresholds.ob` (L4), `Thresholds.feargreed` (L7),
 *     `Thresholds.kimchi` (L8), `Thresholds.realLiq` (L9),
 *     `Thresholds.cvd` (L11), `Thresholds.breakout` (L13),
 *     `Thresholds.atr` (L15), `Thresholds.onchain` (L6).
 */
export const Thresholds = Object.freeze({
	flow: FlowThresholds,
	bb: BbThresholds
} as const);

export type Thresholds = typeof Thresholds;

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
// L1 — Wyckoff Phase Detection (±28)
// Source: dissection §4.1 (multi-window Wyckoff analysis)
// Layer file: src/lib/engine/cogochi/layers/l1Wyckoff.ts
// ---------------------------------------------------------------------------

/**
 * Range-percentage gates, trend-direction threshold, climax-volume
 * multiples, Spring / UTAD / SOS / SOW proximity bands, Secondary-Test
 * (ST) volume floor, volume-decrease confirmation ratio, and score
 * envelope for `computeL1Wyckoff`.
 *
 * All percentage and ratio values are applied against the computed range
 * high / low or the range-average volume inside `analyzeWindow`.
 *
 * dissection §4.1 — range_pct_min / range_pct_max gate valid
 * Wyckoff windows; trend_threshold separates ACC from DIST; the climax
 * trio determines the score contribution of the first-5-candle climax
 * volume spike; Spring / UTAD / SOS / SOW bands are the raw multipliers
 * used in the last-10 / last-7 candle loops.
 */
export const WyckoffThresholds = Object.freeze({
	// Range validity gate — l1Wyckoff.ts:71
	/** `rPct < range_pct_min` ⇒ range too tight, skip window. */
	range_pct_min: 1.5,
	/** `rPct > range_pct_max` ⇒ range too wide, skip window. */
	range_pct_max: 38,

	// Trend direction separator — l1Wyckoff.ts:75-77
	/** `tPct < -trend_threshold` ⇒ ACCUMULATION; `> +trend_threshold` ⇒ DISTRIBUTION. */
	trend_threshold: 0.05,

	// Climax volume multiples — l1Wyckoff.ts:88-90
	/** `climVolRel >= clim_vol_extreme` ⇒ +10 / −10 pts. */
	clim_vol_extreme: 3.5,
	/** `climVolRel >= clim_vol_strong` ⇒ +7 / −7 pts. */
	clim_vol_strong: 2.0,
	/** `climVolRel >= clim_vol_moderate` ⇒ +4 / −4 pts. */
	clim_vol_moderate: 1.2,

	// Spring detection — l1Wyckoff.ts:120-121
	/** Spring: `c.l < rL * spring_dip_pct` (dip below range low). */
	spring_dip_pct: 0.9975,
	/** Spring: `c.c > rL * spring_recover_pct` (close recovers inside range). */
	spring_recover_pct: 0.994,

	// UTAD detection — l1Wyckoff.ts:125-126
	/** UTAD: `c.h > rH * utad_spike_pct` (spike above range high). */
	utad_spike_pct: 1.0025,
	/** UTAD: `c.c < rH * utad_pullback_pct` (close pulls back inside). */
	utad_pullback_pct: 1.006,

	// SOS / SOW detection — l1Wyckoff.ts:142-145
	/** SOS: `c.c > rH * sos_break_pct` (close breaks above high). */
	sos_break_pct: 1.004,
	/** SOW: `c.c < rL * sow_break_pct` (close breaks below low). */
	sow_break_pct: 0.996,

	// Secondary-Test (ST) proximity bands — l1Wyckoff.ts:98-105
	/** ST for ACCUMULATION: `c.l <= rL * st_near_low_pct`. */
	st_near_low_pct: 1.01,
	/** ST for DISTRIBUTION: `c.h >= rH * st_near_high_pct`. */
	st_near_high_pct: 0.99,
	/** ST low-volume qualifier: `c.v < avgVol * st_low_vol_ratio`. */
	st_low_vol_ratio: 0.8,

	// Volume decrease confirmation — l1Wyckoff.ts:157
	/** `shAvg < fhAvg * vol_decrease_ratio` ⇒ volume is contracting (confirms ACC). */
	vol_decrease_ratio: 0.85,

	// Score envelope — l1Wyckoff.ts:80, 166
	/** Base score added / subtracted on pattern detection (±12). */
	score_base: 12,
	/** Absolute score cap passed to `clamp(score, -score_max, score_max)`. */
	score_max: 28
} as const);

export type WyckoffThresholds = typeof WyckoffThresholds;

// ---------------------------------------------------------------------------
// L3 — V-Surge Volume Anomaly (±15)
// Source: dissection §4.3 (volume surge detection)
// Layer file: src/lib/engine/cogochi/layers/l3VSurge.ts
// ---------------------------------------------------------------------------

/**
 * Volume-ratio bands (`surge_factor = recVol / avgVol`) that determine
 * the surge tier and corresponding score for `computeL3VSurge`.
 * Score values are directional-max (directional multiplier applied
 * at runtime: +score if price up, −score if price down).
 *
 * dissection §4.3 — extreme > 5×, strong > 3×, surge > 1.8×,
 * moderate > 1.3×; ultra-low < 0.35×, low-vol < 0.6×.
 */
export const VSurgeThresholds = Object.freeze({
	// Surge-factor band upper bounds — l3VSurge.ts:41-58
	/** `sf > extreme_factor` ⇒ EXTREME SURGE tier. */
	extreme_factor: 5,
	/** `sf > strong_factor` ⇒ STRONG SURGE tier. */
	strong_factor: 3,
	/** `sf > surge_factor` ⇒ SURGE tier (also sets `v_surge = true`). */
	surge_factor: 1.8,
	/** `sf > moderate_factor` ⇒ MODERATE tier. */
	moderate_factor: 1.3,
	/** `sf < ultra_low_factor` ⇒ ULTRA LOW VOL tier (energy building). */
	ultra_low_factor: 0.35,
	/** `sf < low_vol_factor` ⇒ LOW VOL tier. */
	low_vol_factor: 0.6,

	// Score outputs (directional, ±) — l3VSurge.ts:42-58
	/** Absolute score for EXTREME SURGE (directional). */
	score_extreme: 15,
	/** Absolute score for STRONG SURGE (directional). */
	score_strong: 10,
	/** Absolute score for SURGE (directional). */
	score_surge: 6,
	/** Absolute score for MODERATE (directional). */
	score_moderate: 3,
	/** Score for ULTRA LOW VOL (non-directional, always positive). */
	score_ultra_low: 3,
	/** Score for LOW VOL (non-directional, always positive). */
	score_low_vol: 2
} as const);

export type VSurgeThresholds = typeof VSurgeThresholds;

// ---------------------------------------------------------------------------
// L4 — Order Book Imbalance (±12)
// Source: dissection §4 L4 row
// Layer file: src/lib/engine/cogochi/layerEngine.ts:computeL4
// ---------------------------------------------------------------------------

/**
 * Bid/ask ratio band thresholds for `computeL4`. The ratio is
 * `depth.bids / depth.asks` (values > 1 mean more bids than asks).
 *
 * dissection §4 L4 — extreme bid > 3.5, strong bid > 2.0, bid lean
 * > 1.3, balanced 0.8–1.3, ask lean > 0.5, strong ask > 0.3, extreme
 * ask ≤ 0.3.
 */
export const OrderBookThresholds = Object.freeze({
	// Bid-heavy bands — layerEngine.ts:170-172
	/** `ratio > extreme_bid` ⇒ EXTREME BID (+12). */
	extreme_bid: 3.5,
	/** `ratio > strong_bid` ⇒ STRONG BID (+8). */
	strong_bid: 2.0,
	/** `ratio > bid_lean` ⇒ BID LEAN (+4). */
	bid_lean: 1.3,

	// Balanced band — layerEngine.ts:173
	/** `ratio > balanced_upper` (and ≤ bid_lean) ⇒ BALANCED (0). */
	balanced_upper: 0.8,

	// Ask-heavy bands — layerEngine.ts:174-176
	/** `ratio > ask_lean` (and ≤ balanced_upper) ⇒ ASK LEAN (−4). */
	ask_lean: 0.5,
	/** `ratio > strong_ask` (and ≤ ask_lean) ⇒ STRONG ASK (−8). */
	strong_ask: 0.3
	// ratio ≤ strong_ask ⇒ EXTREME ASK (−12) — implicit else branch
} as const);

export type OrderBookThresholds = typeof OrderBookThresholds;

// ---------------------------------------------------------------------------
// L5 — Liquidation Estimate (±12)
// Source: dissection §4 L5 row
// Layer file: src/lib/engine/cogochi/layerEngine.ts:computeL5
// ---------------------------------------------------------------------------

/**
 * Funding-rate gates and OI-change-percent floors that classify the
 * crowd's liquidation risk in `computeL5`. The `liq_dist_pct` is the
 * symmetric percentage offset used to estimate long and short
 * liquidation price levels from the current price.
 *
 * dissection §4 L5 — overcrowded: FR > 0.08 + OI > 4 %; buildup:
 * FR > 0.05 + OI > 2 %; lean: FR > 0.03. Symmetric on short side.
 */
export const LiqEstThresholds = Object.freeze({
	// FR gates — layerEngine.ts:191-196
	/** `fr > fr_overcrowded` (with oi check) ⇒ LONG OVERCROWDED (−12) or SHORT OVERCROWDED (+12). */
	fr_overcrowded: 0.08,
	/** `fr > fr_buildup` (with oi check) ⇒ LONG BUILDUP (−8) or SHORT BUILDUP (+8). */
	fr_buildup: 0.05,
	/** `fr > fr_lean` ⇒ LONG LEAN (−4) or SHORT LEAN (+4). */
	fr_lean: 0.03,

	// OI gates — layerEngine.ts:191-194
	/** `oiPct > oi_overcrowded` is the OI floor for the overcrowded branch. */
	oi_overcrowded: 4,
	/** `oiPct > oi_buildup` is the OI floor for the buildup branch. */
	oi_buildup: 2,

	// Liquidation distance estimate — layerEngine.ts:202-203
	/** Symmetric %-offset applied to current price for liq level estimates (0.10 = 10 %). */
	liq_dist_pct: 0.10
} as const);

export type LiqEstThresholds = typeof LiqEstThresholds;

// ---------------------------------------------------------------------------
// L6 — BTC On-Chain Activity (±10)
// Source: dissection §4 L6 row
// Layer file: src/lib/engine/cogochi/layerEngine.ts:computeL6
// ---------------------------------------------------------------------------

/**
 * Transaction-count bands, average-transaction-value whale thresholds,
 * mempool-pending buckets, and fastest-fee surge levels used by
 * `computeL6`. Score contributions from each sub-component are summed
 * then clamped to ±10.
 *
 * dissection §4 L6 — ntx very active > 450 k, active > 300 k, slow
 * < 150 k; avgTxV whale > 3 BTC, whale-up > 1.5 BTC; mempool extreme
 * > 100 k, congested > 50 k; fee surge > 100 sat/vB, high > 50.
 */
export const OnchainThresholds = Object.freeze({
	// Transaction count bands — layerEngine.ts:218-220
	/** `nTx > ntx_very_active` ⇒ very active (+4). */
	ntx_very_active: 450_000,
	/** `nTx > ntx_active` ⇒ active (+2). */
	ntx_active: 300_000,
	/** `nTx < ntx_slow && nTx > 0` ⇒ slow (−3). */
	ntx_slow: 150_000,

	// Average-TX-value whale bands — layerEngine.ts:222-224
	/** `avgTxV > avg_tx_whale` ⇒ whale movement (−4). */
	avg_tx_whale: 3.0,
	/** `avgTxV > avg_tx_whale_up` ⇒ whale activity up (−2). */
	avg_tx_whale_up: 1.5,

	// Mempool pending bands — layerEngine.ts:226-228
	/** `pending > mempool_extreme` ⇒ extreme congestion (+4). */
	mempool_extreme: 100_000,
	/** `pending > mempool_congested` ⇒ congested (+2). */
	mempool_congested: 50_000,

	// Fastest-fee bands — layerEngine.ts:230-232
	/** `fast > fee_surge` ⇒ fees surging (+3). */
	fee_surge: 100,
	/** `fast > fee_high` ⇒ fees high (+2). */
	fee_high: 50
} as const);

export type OnchainThresholds = typeof OnchainThresholds;

// ---------------------------------------------------------------------------
// L7 — Fear & Greed Index (±8)
// Source: dissection §4 L7 row
// Layer file: src/lib/engine/cogochi/layerEngine.ts:computeL7
// ---------------------------------------------------------------------------

/**
 * Fear & Greed index band upper bounds for `computeL7`. The index
 * runs 0–100; lower values represent fear (contrarian bull), higher
 * values represent greed (contrarian bear).
 *
 * dissection §4 L7 — extreme fear ≤ 15 (+8), fear ≤ 30 (+5),
 * mild fear ≤ 45 (+2), neutral ≤ 55 (0), greed ≤ 70 (−3),
 * high greed ≤ 85 (−5), extreme greed > 85 (−8).
 */
export const FearGreedThresholds = Object.freeze({
	// Band upper bounds — layerEngine.ts:252-258
	/** `fgVal <= extreme_fear` ⇒ EXTREME FEAR (+8). */
	extreme_fear: 15,
	/** `fgVal <= fear` ⇒ FEAR (+5). */
	fear: 30,
	/** `fgVal <= mild_fear` ⇒ MILD FEAR (+2). */
	mild_fear: 45,
	/** `fgVal <= neutral_upper` ⇒ NEUTRAL (0). */
	neutral_upper: 55,
	/** `fgVal <= greed` ⇒ GREED (−3). */
	greed: 70,
	/** `fgVal <= high_greed` ⇒ HIGH GREED (−5); above this is EXTREME GREED (−8). */
	high_greed: 85
} as const);

export type FearGreedThresholds = typeof FearGreedThresholds;

// ---------------------------------------------------------------------------
// L8 — Kimchi Premium (±10)
// Source: dissection §4 L8 row
// Layer file: src/lib/engine/cogochi/layerEngine.ts:computeL8
// ---------------------------------------------------------------------------

/**
 * Kimchi-premium band thresholds for `computeL8`. Positive values
 * indicate Korean-exchange premium over global price (bearish for
 * global price — retail FOMO). Negative values indicate discount
 * (bullish — smart money buying at discount).
 *
 * dissection §4 L8 — extreme premium > 5 (−10), high > 3 (−7),
 * premium > 1.5 (−4), mild > 0.5 (−2), neutral −0.5 to 0.5 (0),
 * mild discount > −2 (+2), discount > −4 (+5), deep discount ≤ −4 (+8).
 */
export const KimchiThresholds = Object.freeze({
	// Premium bands (above 0) — layerEngine.ts:271-274
	/** `prem > extreme_premium` ⇒ EXTREME PREMIUM (−10). */
	extreme_premium: 5,
	/** `prem > high_premium` ⇒ HIGH PREMIUM (−7). */
	high_premium: 3,
	/** `prem > premium` ⇒ PREMIUM (−4). */
	premium: 1.5,
	/** `prem > mild_premium` ⇒ MILD PREMIUM (−2). */
	mild_premium: 0.5,

	// Neutral + discount bands — layerEngine.ts:275-278
	/** `prem > neutral_upper` (and ≤ mild_premium) ⇒ NEUTRAL (0). */
	neutral_upper: -0.5,
	/** `prem > mild_discount` (and ≤ neutral_upper) ⇒ MILD DISCOUNT (+2). */
	mild_discount: -2,
	/** `prem > discount` (and ≤ mild_discount) ⇒ DISCOUNT (+5); below is DEEP DISCOUNT (+8). */
	discount: -4
} as const);

export type KimchiThresholds = typeof KimchiThresholds;

// ---------------------------------------------------------------------------
// L9 — Real Liquidation Events (±10)
// Source: dissection §4 L9 row
// Layer file: src/lib/engine/cogochi/layerEngine.ts:computeL9
// ---------------------------------------------------------------------------

/**
 * USD liquidation volume gates and dominance-ratio thresholds for
 * `computeL9`. Only force-orders within the past hour are tallied.
 * High-tier events (liq_high_usd / liq_dominance_high) also emit
 * typed EventPayload entries for the verdictBuilder.
 *
 * dissection §4 L9 — high threshold $500 k with 2× dominance for
 * squeeze / cascade events; moderate $100 k with 1.5× dominance for
 * dominant-side labelling (no event emission).
 *
 * The named constants `L9_LIQ_HIGH_USD` and `L9_LIQ_DOMINANCE_HIGH`
 * in `layerEngine.ts` are the direct source of `liq_high_usd` and
 * `liq_dominance_high` — they are lifted verbatim into this registry.
 */
export const RealLiqThresholds = Object.freeze({
	// High-tier gate (event-emitting) — layerEngine.ts:287-288
	/** `side_usd > liq_high_usd` triggers SHORT SQUEEZE ACTIVE or LONG CASCADE (±10). */
	liq_high_usd: 500_000,
	/** `side_usd > opposite_usd * liq_dominance_high` ⇒ dominant side confirmed. */
	liq_dominance_high: 2,

	// Moderate-tier gate (label only) — layerEngine.ts:324, 341
	/** `side_usd > liq_moderate_usd` ⇒ side-dominant label (±6, no event). */
	liq_moderate_usd: 100_000,
	/** `side_usd > opposite_usd * liq_dominance_moderate` ⇒ moderate dominance. */
	liq_dominance_moderate: 1.5
} as const);

export type RealLiqThresholds = typeof RealLiqThresholds;

// ---------------------------------------------------------------------------
// L11 — CVD (Cumulative Volume Delta) (±12)
// Source: dissection §4 L11 row
// Layer file: src/lib/engine/cogochi/layerEngine.ts:computeL11
// ---------------------------------------------------------------------------

/**
 * Absorption detection bands and the price-trend threshold used to
 * classify the CVD state in `computeL11`. Score is clamped to ±12.
 *
 * dissection §4 L11 — absorption fires when price movement is smaller
 * than `absorption_price_band` (0.8 %) while the CVD trend is larger
 * than `absorption_cvd_trend_ratio` (30 %) of the starting CVD;
 * directional scoring uses `price_trend_threshold` (0.5 %) to separate
 * bullish / bearish / divergence states.
 *
 * `L11_ABSORPTION_PRICE_BAND` and `L11_ABSORPTION_CVD_TREND_RATIO`
 * in `layerEngine.ts` are lifted verbatim; `price_trend_threshold` and
 * `score_max` are structural consequences of the same formula.
 */
export const CvdLayerThresholds = Object.freeze({
	// Absorption detection — layerEngine.ts:390-391
	/** `|priceChange| < absorption_price_band` is the price-stall gate for absorption. */
	absorption_price_band: 0.008,
	/** `|cvdTrend| > |cvd[0]| * absorption_cvd_trend_ratio` confirms CVD movement. */
	absorption_cvd_trend_ratio: 0.3,

	// Directional state thresholds — layerEngine.ts:442-445
	/** `|priceChange| > price_trend_threshold` separates trending from flat for state labels. */
	price_trend_threshold: 0.005,

	// Score cap — layerEngine.ts:481
	/** Absolute clamp limit passed to `clamp(score, -score_max, score_max)`. */
	score_max: 12
} as const);

export type CvdLayerThresholds = typeof CvdLayerThresholds;

// ---------------------------------------------------------------------------
// L13 — Breakout Detection 7D/30D Range (±12)
// Source: dissection §4 L13 row
// Layer file: src/lib/engine/cogochi/layers/l13Breakout.ts
// ---------------------------------------------------------------------------

/**
 * Proximity-band multipliers applied to the 7-day and 30-day range
 * high / low in `computeL13Breakout`. Values less than 1 define
 * how close to the range high the current price must be to trigger
 * the "HIGH APPROACH" label; values greater than 1 define how close
 * to the range low for the "LOW APPROACH" label.
 *
 * dissection §4 L13 — near high: cp > rangeHigh * 0.96;
 * near low: cp < rangeLow * 1.04.
 */
export const BreakoutThresholds = Object.freeze({
	// Proximity bands — l13Breakout.ts:42-44
	/** `cp > rangeHigh * near_high_pct` ⇒ HIGH APPROACH label. */
	near_high_pct: 0.96,
	/** `cp < rangeLow * near_low_pct` ⇒ LOW APPROACH label. */
	near_low_pct: 1.04
} as const);

export type BreakoutThresholds = typeof BreakoutThresholds;

// ---------------------------------------------------------------------------
// L15 — ATR Volatility State (±6)
// Source: dissection §4 L15 row
// Layer file: src/lib/engine/cogochi/layerEngine.ts:computeL15
// ---------------------------------------------------------------------------

/**
 * ATR-ratio bands (recent 14-bar ATR vs older 14-bar ATR) and
 * risk-management multipliers for `computeL15`. The ratio thresholds
 * classify the volatility state; the multipliers drive the stop-loss
 * and take-profit price levels returned in the result.
 *
 * dissection §4 L15 — ultra-low: ratio < 0.6, low < 0.8, high > 1.3,
 * extreme > 1.8; stop at 1.5× ATR, TP1 at 2.0× ATR, TP2 at 3.0× ATR.
 */
export const AtrThresholds = Object.freeze({
	// Volatility-state ratio bands — layerEngine.ts:524-527
	/** `atrRecent < atrOld * ultra_low_ratio` ⇒ ULTRA_LOW state (+5). */
	ultra_low_ratio: 0.6,
	/** `atrRecent < atrOld * low_ratio` ⇒ LOW state (+3). */
	low_ratio: 0.8,
	/** `atrRecent > atrOld * high_ratio` ⇒ HIGH state (−2). */
	high_ratio: 1.3,
	/** `atrRecent > atrOld * extreme_ratio` ⇒ EXTREME state (−4). */
	extreme_ratio: 1.8,

	// Risk-management multipliers — layerEngine.ts:530-535
	/** Stop-loss distance = ATR × stop_multiplier (applied both sides). */
	stop_multiplier: 1.5,
	/** TP1 distance = ATR × tp1_multiplier. */
	tp1_multiplier: 2.0,
	/** TP2 distance = ATR × tp2_multiplier (also used in R:R ratio numerator). */
	tp2_multiplier: 3.0
} as const);

export type AtrThresholds = typeof AtrThresholds;

// ---------------------------------------------------------------------------
// L18 — 5-Min Short-Term Momentum (±25)
// Source: dissection §4 L18 row
// Layer file: src/lib/engine/cogochi/layers/l18Momentum.ts
// ---------------------------------------------------------------------------

/**
 * Paired (momentum_30m_pct, vol_accel_ratio) gates for `computeL18Momentum`.
 * Each tier requires BOTH the momentum percentage AND the volume
 * acceleration ratio to exceed their respective floors simultaneously.
 * Negative momentum uses the same absolute thresholds mirrored on the
 * bearish side.
 *
 * dissection §4 L18 — extreme: >5 % / >3×; strong: >3 % / >2×;
 * surge: >1.5 % / >1.5×; mild: >0.5 % / >1.2×. Symmetric for dumps.
 */
export const MomentumThresholds = Object.freeze({
	// Momentum percentage floors (30-min return) — l18Momentum.ts:44-65
	/** Extreme surge / dump momentum threshold (5 % in 30 min). */
	momentum_extreme_pct: 5,
	/** Strong surge / dump momentum threshold (3 %). */
	momentum_strong_pct: 3,
	/** Surge / dump momentum threshold (1.5 %). */
	momentum_surge_pct: 1.5,
	/** Mild move momentum threshold (0.5 %). */
	momentum_mild_pct: 0.5,

	// Volume acceleration ratio floors — l18Momentum.ts:44-65
	/** Volume acceleration floor for extreme tier (3× recent vs older). */
	vol_accel_extreme: 3,
	/** Volume acceleration floor for strong tier (2×). */
	vol_accel_strong: 2,
	/** Volume acceleration floor for surge tier (1.5×). */
	vol_accel_surge: 1.5,
	/** Volume acceleration floor for mild tier (1.2×). */
	vol_accel_mild: 1.2,

	// Score outputs — l18Momentum.ts:45-67
	/** Score for extreme tier (directional: +25 up, −25 down). */
	score_extreme: 25,
	/** Score for strong tier (directional: +18 / −18). */
	score_strong: 18,
	/** Score for surge tier (directional: +12 / −12). */
	score_surge: 12,
	/** Score for mild tier (directional: +6 / −6). */
	score_mild: 6
} as const);

export type MomentumThresholds = typeof MomentumThresholds;

// ---------------------------------------------------------------------------
// L19 — OI Acceleration / Position Surge (±15)
// Source: dissection §4 L19 row
// Layer file: src/lib/engine/cogochi/layers/l19OIAccel.ts
// ---------------------------------------------------------------------------

/**
 * OI-change and price-change percentage thresholds that classify the
 * type of position activity in `computeL19OIAccel`. OI is measured
 * over the most recent 12 five-minute snapshots (1 hour); price is
 * the caller-supplied `priceChangePct`.
 *
 * dissection §4 L19 — big OI change > 5 %, normal > 2 %;
 * price directional gate ±0.3 %.
 */
export const OIAccelThresholds = Object.freeze({
	// OI change thresholds — l19OIAccel.ts:43-46
	/** `oiChangePct > big_change_pct` (or < −big_change_pct) ⇒ "big" tier (±15 / ±12). */
	big_change_pct: 5,
	/** `oiChangePct > change_pct` (or < −change_pct) ⇒ normal tier (±8 / ±5). */
	change_pct: 2,

	// Price direction gate — l19OIAccel.ts:41-42
	/** `priceChangePct > price_threshold_pct` ⇒ price up; `< −price_threshold_pct` ⇒ price down. */
	price_threshold_pct: 0.3
} as const);

export type OIAccelThresholds = typeof OIAccelThresholds;

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
 *   - E6b (merged) — `Thresholds.bb` (L14)
 *   - E6c (this slice) — all remaining namespaces: L1, L3, L4, L5,
 *     L6, L7, L8, L9, L11, L13, L15, L18, L19
 */
export const Thresholds = Object.freeze({
	flow: FlowThresholds,
	bb: BbThresholds,
	wyckoff: WyckoffThresholds,
	vSurge: VSurgeThresholds,
	ob: OrderBookThresholds,
	liqEst: LiqEstThresholds,
	onchain: OnchainThresholds,
	fearGreed: FearGreedThresholds,
	kimchi: KimchiThresholds,
	realLiq: RealLiqThresholds,
	cvd: CvdLayerThresholds,
	breakout: BreakoutThresholds,
	atr: AtrThresholds,
	momentum: MomentumThresholds,
	oiAccel: OIAccelThresholds
} as const);

export type Thresholds = typeof Thresholds;

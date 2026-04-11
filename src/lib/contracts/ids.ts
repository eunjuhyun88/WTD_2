/**
 * Contract ID Namespace
 *
 * Single source of truth for every typed identifier that crosses a pipeline
 * layer boundary in CHATBATTLE.
 *
 * The authority chain is fixed:
 *   raw.*  →  feat.*  →  event.*  →  state.*  →  verdict.*  →  trajectory.*  →  pair.*
 *
 * Rules:
 *  1. Each layer may only emit IDs from its own prefix.
 *  2. A downstream layer may reference IDs from any upstream layer.
 *  3. Upstream layers may NOT reference downstream IDs. (Enforced by review,
 *     not by types — this file is the contract, not a runtime graph.)
 *  4. New IDs are added by extending the corresponding enum-as-const below.
 *     Never by free-text string concatenation at call sites.
 *
 * Source of truth for the concrete values:
 *   docs/exec-plans/active/alpha-terminal-harness-engine-spec-2026-04-09.md §§1–8
 *   docs/ORPO_DATA_SCHEMA_PIPELINE_v1_2026-02-26.md §§2–4
 *   docs/exec-plans/active/three-pipeline-integration-design-2026-04-11.md §Phase 0
 */

// ---------------------------------------------------------------------------
// Layer prefix enum
// ---------------------------------------------------------------------------

export const ContractLayer = {
	RAW: 'raw',
	FEAT: 'feat',
	EVENT: 'event',
	STATE: 'state',
	VERDICT: 'verdict',
	TRAJECTORY: 'trajectory',
	PAIR: 'pair'
} as const;

export type ContractLayer = (typeof ContractLayer)[keyof typeof ContractLayer];

// ---------------------------------------------------------------------------
// Raw data IDs  (harness engine-spec §4)
// ---------------------------------------------------------------------------
//
// IMPORTANT: `RawId` is an OPEN type, not a closed enum. The raw-data layer
// in CHATBATTLE is user-configurable — loaders, providers, and user
// extensions may emit any valid `raw.*` string. Locking the type to a fixed
// list would prevent per-user subscriptions from choosing which raws to pull
// and would make Phase 4 extended indicators (MVRV, Sharpe, Material
// Indicators orderbook, etc.) require a contract edit each time.
//
// The const below (`KnownRawId`) is a CONVENIENCE CATALOG, not a type guard.
// It documents the IDs that the canonical harness engine-spec §4 quotes
// verbatim. Runtime validation of a raw id uses `isRawId()` or the
// `RawSourceSchema` / `RawSourceSubscriptionSchema` in `./registry.ts`.

/** Open template literal: any string starting with `raw.` is a valid RawId. */
export type RawId = `raw.${string}`;

/** Runtime guard for an open RawId string. */
export function isRawId(s: string): s is RawId {
	return s.startsWith('raw.') && s.length > 4;
}

/**
 * Convenience catalog of raws explicitly named by the harness engine-spec §4.
 * Providers, tests, and tooling may reference these by symbol to keep
 * renames traceable, but the set is NOT exhaustive and NOT closed.
 */
export const KnownRawId = {
	// Global / cross-market
	FEAR_GREED_VALUE: 'raw.global.fear_greed.value',
	USD_KRW_RATE: 'raw.global.usd_krw.rate',
	BTC_N_TX_24H: 'raw.global.btc_onchain.n_tx_24h',
	BTC_TOTAL_SENT_24H: 'raw.global.btc_onchain.total_btc_sent_24h',
	BTC_AVG_TX_VALUE: 'raw.global.btc_onchain.avg_tx_value',
	MEMPOOL_PENDING_TX: 'raw.global.mempool.pending_tx',
	MEMPOOL_VSIZE_MB: 'raw.global.mempool.vsize_mb',
	MEMPOOL_FASTEST_FEE: 'raw.global.mempool.fastest_fee',
	MEMPOOL_HALFHOUR_FEE: 'raw.global.mempool.halfhour_fee',
	MEMPOOL_HOUR_FEE: 'raw.global.mempool.hour_fee',
	UPBIT_PRICE_MAP: 'raw.global.exchange.upbit_price_map',
	UPBIT_VOLUME_MAP: 'raw.global.exchange.upbit_volume_map',
	BITHUMB_PRICE_MAP: 'raw.global.exchange.bithumb_price_map',
	SECTOR_MAP: 'raw.global.sector.map',
	SECTOR_OVERRIDE: 'raw.global.sector.override',

	// Scan universe
	TICKER_SYMBOL: 'raw.scan.ticker_24h.symbol',
	TICKER_QUOTE_VOLUME: 'raw.scan.ticker_24h.quote_volume',
	TICKER_PRICE_CHANGE_PCT: 'raw.scan.ticker_24h.price_change_pct',
	TICKER_HIGH_PRICE: 'raw.scan.ticker_24h.high_price',
	TICKER_LOW_PRICE: 'raw.scan.ticker_24h.low_price',
	TICKER_LAST_PRICE: 'raw.scan.ticker_24h.last_price',
	UNIVERSE_IS_USDT: 'raw.scan.universe.is_usdt',

	// Symbol OHLCV
	KLINES_1M: 'raw.symbol.klines.1m',
	KLINES_5M: 'raw.symbol.klines.5m',
	KLINES_15M: 'raw.symbol.klines.15m',
	KLINES_1H: 'raw.symbol.klines.1h',
	KLINES_4H: 'raw.symbol.klines.4h',
	KLINES_1D: 'raw.symbol.klines.1d',

	// Derivatives / liquidity
	MARK_PRICE: 'raw.symbol.mark_price',
	FUNDING_RATE: 'raw.symbol.funding_rate',
	OI_HIST_5M: 'raw.symbol.oi_hist.5m',
	OI_HIST_1H: 'raw.symbol.oi_hist.1h',
	OI_HIST_DISPLAY_TF: 'raw.symbol.oi_hist.display_tf',
	LONG_SHORT_GLOBAL: 'raw.symbol.long_short.global',
	TAKER_BUY_SELL_RATIO: 'raw.symbol.taker_buy_sell_ratio',
	DEPTH_L2_20: 'raw.symbol.depth.l2_20',
	FORCE_ORDERS_1H: 'raw.symbol.force_orders.1h',
	FORCE_ORDERS_4H: 'raw.symbol.force_orders.4h',
	AGG_TRADES_LIVE: 'raw.symbol.agg_trades.live',
	BOOK_TICKER_LIVE: 'raw.symbol.book_ticker.live',
	DEPTH_LIVE: 'raw.symbol.depth.live',

	// Session / user-controlled
	SESSION_SCAN_MODE: 'raw.session.scan_mode',
	SESSION_TOP_N: 'raw.session.top_n',
	SESSION_CUSTOM_SYMBOLS: 'raw.session.custom_symbols',
	SESSION_DISPLAY_TIMEFRAME: 'raw.session.display_timeframe',
	SESSION_MIN_ALPHA: 'raw.session.min_alpha',
	SESSION_ACTIVE_FILTER: 'raw.session.active_filter',
	SESSION_SELECTED_SYMBOL: 'raw.session.selected_symbol',
	SESSION_INTENT_FOCUS: 'raw.session.intent_focus'
} as const;

export type KnownRawId = (typeof KnownRawId)[keyof typeof KnownRawId];

// ---------------------------------------------------------------------------
// Structural state catalog  (harness engine-spec §7.1)
// ---------------------------------------------------------------------------
//
// The canonical enum of structure states the Verdict engine may assign.
// Anything outside this list is a contract violation.

export const StructureStateId = {
	NONE: 'state.none',
	RANGE_UNRESOLVED: 'state.range_unresolved',

	ACC_PHASE_A: 'state.acc_phase_a',
	ACC_PHASE_B: 'state.acc_phase_b',
	ACC_PHASE_C: 'state.acc_phase_c',
	ACC_PHASE_D: 'state.acc_phase_d',
	ACC_PHASE_E: 'state.acc_phase_e',
	REACCUMULATION: 'state.reaccumulation',

	DIST_PHASE_A: 'state.dist_phase_a',
	DIST_PHASE_B: 'state.dist_phase_b',
	DIST_PHASE_C: 'state.dist_phase_c',
	DIST_PHASE_D: 'state.dist_phase_d',
	DIST_PHASE_E: 'state.dist_phase_e',
	REDISTRIBUTION: 'state.redistribution',

	MARKUP_CONTINUATION: 'state.markup_continuation',
	MARKDOWN_CONTINUATION: 'state.markdown_continuation',

	FAILED_BULL_BREAKOUT: 'state.failed_bull_breakout',
	FAILED_BEAR_BREAKDOWN: 'state.failed_bear_breakdown'
} as const;

export type StructureStateId = (typeof StructureStateId)[keyof typeof StructureStateId];

// ---------------------------------------------------------------------------
// Verdict bias enum  (harness engine-spec §8.2)
// ---------------------------------------------------------------------------

export const VerdictBias = {
	STRONG_BULL: 'STRONG_BULL',
	BULL: 'BULL',
	NEUTRAL: 'NEUTRAL',
	BEAR: 'BEAR',
	STRONG_BEAR: 'STRONG_BEAR'
} as const;

export type VerdictBias = (typeof VerdictBias)[keyof typeof VerdictBias];

export const VerdictUrgency = {
	LOW: 'LOW',
	MEDIUM: 'MEDIUM',
	HIGH: 'HIGH'
} as const;

export type VerdictUrgency = (typeof VerdictUrgency)[keyof typeof VerdictUrgency];

// ---------------------------------------------------------------------------
// Event severity / direction  (harness engine-spec §6, shared across events)
// ---------------------------------------------------------------------------

export const EventDirection = {
	BULL: 'bull',
	BEAR: 'bear',
	NEUTRAL: 'neutral',
	CONTEXT: 'context'
} as const;

export type EventDirection = (typeof EventDirection)[keyof typeof EventDirection];

export const EventSeverity = {
	LOW: 'low',
	MEDIUM: 'medium',
	HIGH: 'high'
} as const;

export type EventSeverity = (typeof EventSeverity)[keyof typeof EventSeverity];

// ---------------------------------------------------------------------------
// Trajectory / pair IDs are assigned at insert time by the database.
// We freeze the shape of those identifiers here so that clients can pass
// them around type-safely without importing the DB driver.
// ---------------------------------------------------------------------------

/** UUID string as stored in `decision_trajectories.id`. */
export type TrajectoryId = string & { readonly __brand: 'TrajectoryId' };

/** UUID string as stored in `ml_preference_pairs.id`. */
export type PairId = string & { readonly __brand: 'PairId' };

/**
 * Opaque trace identifier that links a single user-facing decision to every
 * raw / feat / event / verdict ID recorded while computing it. Generated by
 * the server, echoed back to the client, persisted on the trajectory row.
 */
export type TraceId = string & { readonly __brand: 'TraceId' };

// ---------------------------------------------------------------------------
// Narrow helpers for runtime assertions
// ---------------------------------------------------------------------------

/**
 * Check that a string has the given contract layer prefix. Used by the
 * runtime validator in verdict.ts / trajectory.ts; NOT exported as a zod
 * schema because the set of concrete IDs is deliberately open-ended.
 */
export function hasLayerPrefix(id: string, layer: ContractLayer): boolean {
	return id.startsWith(`${layer}.`);
}

/** Returns the layer prefix of an ID, or `null` if no known prefix matches. */
export function layerOf(id: string): ContractLayer | null {
	const dot = id.indexOf('.');
	if (dot <= 0) return null;
	const prefix = id.slice(0, dot);
	const layers: ContractLayer[] = [
		ContractLayer.RAW,
		ContractLayer.FEAT,
		ContractLayer.EVENT,
		ContractLayer.STATE,
		ContractLayer.VERDICT,
		ContractLayer.TRAJECTORY,
		ContractLayer.PAIR
	];
	return layers.find((l) => l === prefix) ?? null;
}

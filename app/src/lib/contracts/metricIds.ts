/**
 * Metric ID Namespace  (`feat.metric.*`)
 *
 * Canonical identifiers for all computed metrics in the metric engine.
 * These live in the `feat.*` contract layer — downstream of `raw.*` data
 * acquisition and upstream of `event.*` / `verdict.*` outputs.
 *
 * Rules (inherited from ids.ts §Rules):
 *  1. All values start with `feat.metric.` — never free-text strings at call sites.
 *  2. New metrics are added here first, then referenced by compute functions.
 *  3. Deprecated metrics are kept with a JSDoc @deprecated tag; never deleted
 *     until all consumers have been migrated.
 *
 * Source of truth: docs/exec-plans/active/splendid-snacking-charm.md (Sprint 1)
 */

// ---------------------------------------------------------------------------
// MetricId constants
// ---------------------------------------------------------------------------

export const MetricId = {
	// ── CVD family ──────────────────────────────────────────────────────────
	/** Cumulative Volume Delta — raw taker buy minus sell running sum. */
	CVD_RAW: 'feat.metric.cvd.raw',
	/** CVD trend direction derived from the raw CVD slope. */
	CVD_TREND: 'feat.metric.cvd.trend',

	// ── Buy / Sell ──────────────────────────────────────────────────────────
	/** Taker buy volume / taker sell volume ratio over the lookback window. */
	BUY_SELL_RATIO: 'feat.metric.buy_sell_ratio',

	// ── Basis & Funding ─────────────────────────────────────────────────────
	/** (mark_price - spot_price) / spot_price * 100 — perpetual basis percent. */
	BASIS_PCT: 'feat.metric.basis_pct',
	/** Funding rate expressed in basis points (rate * 10 000). */
	FUNDING_BPS: 'feat.metric.funding_bps',
	/** OI-weighted average funding rate across venues: SUM(rate_i * OI_i) / SUM(OI_i). */
	FUNDING_OI_WEIGHTED: 'feat.metric.funding_oi_weighted',

	// ── Open Interest ────────────────────────────────────────────────────────
	/** Linear regression slope of OI history (normalised -1 to +1). */
	OI_TREND: 'feat.metric.oi.trend',
	/** OI trend vs price trend agreement score. Positive = convergent, negative = divergent. */
	OI_PRICE_CONVERGENCE: 'feat.metric.oi.price_convergence',
	/** OI divergence from price (OI falling while price rising, or vice-versa). */
	OI_DIVERGENCE: 'feat.metric.oi.divergence',
	/** Cross-exchange aggregated OI in USD (coin-margined + stablecoin-margined). */
	OI_AGGREGATED: 'feat.metric.oi.aggregated',

	// ── On-chain valuation ───────────────────────────────────────────────────
	/** Spent Output Profit Ratio — realized_value_spent / value_at_creation. */
	SOPR: 'feat.metric.onchain.sopr',
	/** Adjusted SOPR excluding UTXOs younger than 1 hour. */
	ASOPR: 'feat.metric.onchain.asopr',
	/** Short-Term Holder SOPR (UTXOs < 155 days). */
	STH_SOPR: 'feat.metric.onchain.sth_sopr',
	/** Long-Term Holder SOPR (UTXOs >= 155 days). */
	LTH_SOPR: 'feat.metric.onchain.lth_sopr',
	/** Market Value to Realized Value ratio — market_cap / realized_cap. */
	MVRV: 'feat.metric.onchain.mvrv',
	/** STH-MVRV — MVRV for UTXOs younger than 155 days. */
	STH_MVRV: 'feat.metric.onchain.sth_mvrv',
	/** LTH-MVRV — MVRV for UTXOs 155 days or older. */
	LTH_MVRV: 'feat.metric.onchain.lth_mvrv',
	/** MVRV Z-Score — (market_cap - realized_cap) / stddev(market_cap - realized_cap). */
	MVRV_ZSCORE: 'feat.metric.onchain.mvrv_zscore',
	/** Net Unrealized Profit/Loss — (market_cap - realized_cap) / market_cap. */
	NUPL: 'feat.metric.onchain.nupl',
	/** Coin Days Destroyed — SUM(coins * days_dormant) for coins moved in period. */
	CDD: 'feat.metric.onchain.cdd',
	/** Dormancy — CDD / daily_tx_count; high values signal old coin movement. */
	DORMANCY: 'feat.metric.onchain.dormancy',

	// ── Flow ─────────────────────────────────────────────────────────────────
	/** 7-day simple moving average of (exchange inflow - outflow). */
	EXCHANGE_NETFLOW: 'feat.metric.flow.exchange_netflow',
	/** Exchange netflow 7-day SMA. */
	EXCHANGE_NETFLOW_MA7: 'feat.metric.flow.exchange_netflow_ma7',

	// ── Order Book ───────────────────────────────────────────────────────────
	/** (bid_depth - ask_depth) / (bid_depth + ask_depth) — range [-1, +1]. */
	BOOK_IMBALANCE: 'feat.metric.book.imbalance',

	// ── Sentiment ────────────────────────────────────────────────────────────
	/** Z-score of (unique_social_volume * sentiment_balance) over rolling window. */
	WEIGHTED_SENTIMENT: 'feat.metric.sentiment.weighted',
	/** Positive sentiment score minus negative sentiment score (> 0.7 confidence threshold). */
	SENTIMENT_BALANCE: 'feat.metric.sentiment.balance',

	// ── Divergence ───────────────────────────────────────────────────────────
	/** RSI divergence detection: type × confidence score. */
	RSI_DIVERGENCE: 'feat.metric.divergence.rsi',
	/** Volume trend divergence from price trend. */
	VOL_DIVERGENCE: 'feat.metric.divergence.volume',

	// ── Cycle ────────────────────────────────────────────────────────────────
	/** BTC halving cycle position [0, 1] where 0 = halving day, 1 = eve of next halving. */
	CYCLE_POSITION: 'feat.metric.cycle.position',

	// ── Liquidation estimates ─────────────────────────────────────────────────
	/** ATR-based estimated long liquidation price level. */
	LIQ_LONG_EST: 'feat.metric.liq.long_est',
	/** ATR-based estimated short liquidation price level. */
	LIQ_SHORT_EST: 'feat.metric.liq.short_est'
} as const;

export type MetricIdValue = (typeof MetricId)[keyof typeof MetricId];

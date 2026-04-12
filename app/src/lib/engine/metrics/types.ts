// ═══════════════════════════════════════════════════════════════
// Metric Engine — Core Types
// ═══════════════════════════════════════════════════════════════

import type { BinanceKline } from '../types';

// ─── Metric Result ───────────────────────────────────────────

/** The output of a single metric computation. */
export interface MetricResult {
	/** Canonical metric identifier — use MetricId constants from metricIds.ts. */
	id: string;
	/** Computed scalar value. Unit depends on metric definition. */
	value: number;
	/** Unix epoch ms when this result was computed (Date.now()). */
	timestamp: number;
	/** Cache validity in milliseconds. Expired entries are evicted on read. */
	ttlMs: number;
	/** Origin of this result. */
	source: 'computed' | 'provider' | 'cached';
	/** Human-readable explanation of the result (optional). */
	detail?: string;
}

// ─── Metric Compute Function ─────────────────────────────────

/**
 * Pure function signature for all metric computations.
 * Returns null when required input data is absent (fail-open policy).
 */
export type MetricComputeFn = (ctx: MetricContext) => MetricResult | null;

// ─── Metric Context ──────────────────────────────────────────

/** 5-minute kline with optional taker buy volume. */
export interface Kline5m {
	open: number;
	close: number;
	high: number;
	low: number;
	volume: number;
	/** Taker buy volume if available from Binance aggTrades or kline endpoint. */
	buyVolume?: number;
	time: number;
}

/** Derivatives market data for a single symbol. */
export interface DerivativesContext {
	oi?: number | null;
	funding?: number | null;
	predFunding?: number | null;
	lsRatio?: number | null;
	liqLong?: number;
	liqShort?: number;
	markPrice?: number;
	spotPrice?: number;
	oiHistory?: Array<{ timestamp: number; oi: number }>;
}

/** On-chain metrics (CryptoQuant / Glassnode). All values may be null when provider is unavailable. */
export interface OnchainContext {
	mvrv?: number | null;
	nupl?: number | null;
	sopr?: number | null;
	asopr?: number | null;
	sthSopr?: number | null;
	lthSopr?: number | null;
	sthMvrv?: number | null;
	lthMvrv?: number | null;
	exchangeNetflow?: number | null;
	exchangeInflow?: number | null;
	exchangeOutflow?: number | null;
	whaleActivity?: number | null;
	minerFlow?: number | null;
	stablecoinFlow?: number | null;
	activeAddresses?: number | null;
	etfFlow?: number | null;
	realizedCap?: number | null;
	marketCap?: number | null;
	supplyInProfit?: number | null;
	cdd?: number | null;
	dailyTxCount?: number | null;
}

/** Social / sentiment metrics (Santiment / Alternative.me). */
export interface SentimentContext {
	fearGreed?: number | null;
	socialVolume?: number | null;
	uniqueSocialVolume?: number | null;
	sentimentPositive?: number | null;
	sentimentNegative?: number | null;
	socialSentiment?: number | null;
	newsImpact?: number | null;
	searchTrend?: number | null;
}

/** Level-2 order book snapshot. */
export interface DepthContext {
	/** [price, quantity] pairs sorted best-bid first. */
	bids: Array<[number, number]>;
	/** [price, quantity] pairs sorted best-ask first. */
	asks: Array<[number, number]>;
}

/**
 * Full input context passed to every MetricComputeFn.
 * All optional fields may be absent; compute functions must handle null/undefined
 * and return null rather than throwing when required data is missing.
 */
export interface MetricContext {
	/** Trading pair symbol, e.g. 'BTCUSDT'. */
	symbol: string;
	/** Primary timeframe for this context, e.g. '15m', '1h', '4h'. */
	timeframe: string;
	/** Primary OHLCV klines (canonical timeframe). */
	klines: BinanceKline[];
	/** 5-minute klines with optional taker buy volume for CVD computation. */
	klines5m?: Kline5m[];
	/** 1-hour klines for multi-timeframe context. */
	klines1h?: BinanceKline[];
	/** 1-day klines for macro/cycle context. */
	klines1d?: BinanceKline[];
	/** Derivatives: OI, funding, L/S ratio, liquidations, basis. */
	derivatives?: DerivativesContext;
	/** On-chain: valuation ratios, flows, supply metrics. */
	onchain?: OnchainContext;
	/** Social/sentiment: fear & greed, social volume, sentiment scores. */
	sentiment?: SentimentContext;
	/** Order book: bids and asks at snapshot time. */
	depth?: DepthContext;
}

// ═══════════════════════════════════════════════════════════════
// Stockclaw — Raw Source Adapters (Phase 1 A-P0 slice 1)
// ═══════════════════════════════════════════════════════════════
//
// Typed binding between `KnownRawId` (from `src/lib/contracts/ids.ts`)
// and the concrete HTTP fetchers that already exist across sibling
// files such as `marketDataService.ts`, `feargreed.ts`, `coingecko.ts`.
//
// Why this file exists
// --------------------
// The Phase 0 foundation froze the `raw.*` contract namespace in
// `src/lib/contracts/ids.ts`, but the actual fetchers are still
// referenced by ad-hoc string names (`'binance:klines'`, `'feargreed'`,
// …). This file is the thin adapter that closes that gap without
// rewriting fetchers:
//
//   1. Each `KnownRawId` entry maps to exactly one fetch function.
//   2. `RawSourceInputs[ID]` and `RawSourceOutputs[ID]` carry strict
//      per-ID input + output shapes.
//   3. `readRaw(id, input)` is the single generic entry point used by
//      Phase 2 feature layers and Phase 3 the verdict assembler.
//
// Invariants locked by dissection §10 Resolved Decisions
// ------------------------------------------------------
// §10 Q1 (fixed timeframe authority):
//   - OI_HIST_5M  → always `period=5m limit=12` on the engine path.
//   - OI_HIST_1H  → always `period=1h limit=6`  on the engine path.
//   - LONG_SHORT_GLOBAL      → always `period=1h limit=6`.
//   - TAKER_BUY_SELL_RATIO   → always `period=1h limit=6`.
//   Callers cannot override these. Display-timeframe fetches that
//   follow the UI `#period` dropdown use the separate
//   `OI_HIST_DISPLAY_TF` id (wired in a later slice).
//
// §10 Q6 (force-orders window):
//   - FORCE_ORDERS_1H → `limit=50`, existing behavior.
//   - FORCE_ORDERS_4H → `limit=200` (same endpoint, widened limit).
//
// Scope of this commit
// --------------------
// This is the FIRST slice of Phase 1 A-P0. It implements the 17
// raws whose fetchers already exist in `marketDataService.ts` and
// `feargreed.ts`. Subsequent slices add:
//   - binance klines + ticker (BINANCE_* and TICKER_*)
//   - coinalyze / alt OI providers
//   - upbit volume map, bithumb, sector 2-level registry
//   - sessions (resolves per-user vs per-device per §10 Q3)
//
// No existing consumer is migrated in this commit. This file is
// additive; the next slice will start migrating `scanner.ts`,
// `scanEngine.ts`, `toolExecutor.ts`, and the cogochi thermometer
// endpoint to go through `readRaw()`.

import { KnownRawId } from '$lib/contracts/ids';
import {
	fetchDepth,
	fetchOIHistory,
	fetchTakerRatio,
	fetchGlobalLS,
	fetchForceOrders,
	fetchBtcOnchain,
	fetchMempool,
	fetchUsdKrw,
	fetchUpbitPrices,
	fetchBithumbPrices,
	fetchBtcDominance,
	type OrderBookSnapshot,
	type OIHistoryPoint,
	type TakerRatioPoint,
	type GlobalLSPoint,
	type ForceOrder
} from '$lib/server/marketDataService';
import { fetchFearGreed } from '$lib/server/feargreed';
import { fetchKlinesServer, fetch24hrServer } from './binance';
import type { BinanceKline, Binance24hr } from '$lib/engine/types';
import { binanceQuota } from './binanceQuota';

// ---------------------------------------------------------------------------
// Per-raw input + output type maps
// ---------------------------------------------------------------------------
//
// Each map is keyed on the literal `raw.*` string via `KnownRawId.*`. Using
// the catalog symbols keeps renames traceable (grep for `FEAR_GREED_VALUE`
// in the whole repo finds both the contract definition and the adapter).
//
// Absent raws fall back to `unknown` for input and output. See `readRaw()`
// for the runtime behavior in that case.

type EmptyInput = Record<string, never>;

/**
 * Kline fetches carry a caller-supplied `limit` because different feature
 * layers need different lookback windows (wyckoff needs ~200 bars, MTF
 * needs ~100, sparkline panels need ~50). Unlike the OI/LS/taker raws,
 * the dissection does not lock a single limit per timeframe.
 */
type KlinesInput = { symbol: string; limit: number };

export interface RawSourceInputs {
	[KnownRawId.FEAR_GREED_VALUE]: EmptyInput;
	[KnownRawId.USD_KRW_RATE]: EmptyInput;
	[KnownRawId.BTC_N_TX_24H]: EmptyInput;
	[KnownRawId.BTC_TOTAL_SENT_24H]: EmptyInput;
	[KnownRawId.BTC_AVG_TX_VALUE]: EmptyInput;
	[KnownRawId.MEMPOOL_PENDING_TX]: EmptyInput;
	[KnownRawId.MEMPOOL_VSIZE_MB]: EmptyInput;
	[KnownRawId.MEMPOOL_FASTEST_FEE]: EmptyInput;
	[KnownRawId.MEMPOOL_HALFHOUR_FEE]: EmptyInput;
	[KnownRawId.MEMPOOL_HOUR_FEE]: EmptyInput;
	[KnownRawId.KLINES_1M]: KlinesInput;
	[KnownRawId.KLINES_5M]: KlinesInput;
	[KnownRawId.KLINES_15M]: KlinesInput;
	[KnownRawId.KLINES_30M]: KlinesInput;
	[KnownRawId.KLINES_1H]: KlinesInput;
	[KnownRawId.KLINES_4H]: KlinesInput;
	[KnownRawId.KLINES_1D]: KlinesInput;
	[KnownRawId.KLINES_1W]: KlinesInput;
	[KnownRawId.TICKER_24HR]: { symbol: string };
	[KnownRawId.FUNDING_RATE]: { symbol: string };
	[KnownRawId.MARK_PRICE]: { symbol: string };
	[KnownRawId.OPEN_INTEREST_POINT]: { symbol: string };
	[KnownRawId.DEPTH_L2_20]: { symbol: string };
	[KnownRawId.OI_HIST_5M]: { symbol: string };
	[KnownRawId.OI_HIST_1H]: { symbol: string };
	[KnownRawId.LONG_SHORT_GLOBAL]: { symbol: string };
	[KnownRawId.LONG_SHORT_TOP_1H]: { symbol: string };
	[KnownRawId.TAKER_BUY_SELL_RATIO]: { symbol: string };
	[KnownRawId.FORCE_ORDERS_1H]: { symbol: string };
	[KnownRawId.FORCE_ORDERS_4H]: { symbol: string };
	[KnownRawId.UPBIT_PRICE_MAP]: EmptyInput;
	[KnownRawId.BITHUMB_PRICE_MAP]: EmptyInput;
	[KnownRawId.BTC_DOMINANCE]: EmptyInput;
}

export interface RawSourceOutputs {
	[KnownRawId.FEAR_GREED_VALUE]: number | null;
	[KnownRawId.USD_KRW_RATE]: number;
	[KnownRawId.BTC_N_TX_24H]: number;
	[KnownRawId.BTC_TOTAL_SENT_24H]: number;
	[KnownRawId.BTC_AVG_TX_VALUE]: number;
	[KnownRawId.MEMPOOL_PENDING_TX]: number;
	[KnownRawId.MEMPOOL_VSIZE_MB]: number;
	[KnownRawId.MEMPOOL_FASTEST_FEE]: number;
	[KnownRawId.MEMPOOL_HALFHOUR_FEE]: number;
	[KnownRawId.MEMPOOL_HOUR_FEE]: number;
	[KnownRawId.KLINES_1M]: BinanceKline[];
	[KnownRawId.KLINES_5M]: BinanceKline[];
	[KnownRawId.KLINES_15M]: BinanceKline[];
	[KnownRawId.KLINES_30M]: BinanceKline[];
	[KnownRawId.KLINES_1H]: BinanceKline[];
	[KnownRawId.KLINES_4H]: BinanceKline[];
	[KnownRawId.KLINES_1D]: BinanceKline[];
	[KnownRawId.KLINES_1W]: BinanceKline[];
	[KnownRawId.TICKER_24HR]: Binance24hr;
	[KnownRawId.FUNDING_RATE]: number | null;
	[KnownRawId.MARK_PRICE]: number | null;
	[KnownRawId.OPEN_INTEREST_POINT]: number | null;
	[KnownRawId.DEPTH_L2_20]: OrderBookSnapshot;
	[KnownRawId.OI_HIST_5M]: OIHistoryPoint[];
	[KnownRawId.OI_HIST_1H]: OIHistoryPoint[];
	[KnownRawId.LONG_SHORT_GLOBAL]: GlobalLSPoint[];
	[KnownRawId.LONG_SHORT_TOP_1H]: number | null;
	[KnownRawId.TAKER_BUY_SELL_RATIO]: TakerRatioPoint[];
	[KnownRawId.FORCE_ORDERS_1H]: ForceOrder[];
	[KnownRawId.FORCE_ORDERS_4H]: ForceOrder[];
	[KnownRawId.UPBIT_PRICE_MAP]: Map<string, number>;
	[KnownRawId.BITHUMB_PRICE_MAP]: Map<string, number>;
	[KnownRawId.BTC_DOMINANCE]: number | null;
}

/** The subset of `KnownRawId` values this slice implements. */
export type SupportedRawId = keyof RawSourceInputs & keyof RawSourceOutputs;

/**
 * Narrowed union of every `KLINES_*` raw id. Callers that dispatch a
 * runtime-string timeframe (e.g. `'1h' | '4h' | '1d'`) to `readRaw` use
 * this type so the generic collapses the return to `BinanceKline[]`
 * instead of the full `SupportedRawId` output union (which would contain
 * unrelated scalar/map types and force the call site to cast).
 */
export type KlinesRawId =
  | typeof KnownRawId.KLINES_1M
  | typeof KnownRawId.KLINES_5M
  | typeof KnownRawId.KLINES_15M
  | typeof KnownRawId.KLINES_30M
  | typeof KnownRawId.KLINES_1H
  | typeof KnownRawId.KLINES_4H
  | typeof KnownRawId.KLINES_1D
  | typeof KnownRawId.KLINES_1W;

/**
 * Map a runtime-string timeframe (e.g. `'1h'`, `'4h'`, `'1d'`) to its
 * corresponding `KLINES_*` raw atom. This is the canonical helper for
 * every caller that accepts a user-supplied timeframe string and needs
 * to dispatch through `readRaw`.
 *
 * Unknown inputs collapse to `KLINES_4H`, matching the historical
 * default of `fetchKlinesServer(symbol, interval = '4h')`. Callers that
 * already validate against the `normalizeTimeframe` canonical set never
 * hit the default — it is defensive only.
 *
 * Before this lived here, four identical copies existed across
 * `providers/registry.ts`, `marketSnapshotService.ts`, the cogochi
 * analyze endpoint, and `douni/toolExecutor.ts`. Centralizing it closes
 * the B6+B7 follow-up without touching the divergent `MarketContext`
 * assemblers on either side.
 */
export function klinesRawIdForTimeframe(tf: string): KlinesRawId {
  switch (tf) {
    case '1m': return KnownRawId.KLINES_1M;
    case '5m': return KnownRawId.KLINES_5M;
    case '15m': return KnownRawId.KLINES_15M;
    case '30m': return KnownRawId.KLINES_30M;
    case '1h': return KnownRawId.KLINES_1H;
    case '4h': return KnownRawId.KLINES_4H;
    case '1d': return KnownRawId.KLINES_1D;
    case '1w': return KnownRawId.KLINES_1W;
    default: return KnownRawId.KLINES_4H;
  }
}

// ---------------------------------------------------------------------------
// Fixed timeframe authority constants (dissection §10 Q1)
// ---------------------------------------------------------------------------
//
// These values are the only permitted arguments the adapter passes to the
// underlying OI / LS / taker fetchers on the engine path. They are named
// constants so a code review immediately flags any caller that tries to
// change them.

const OI_5M_LIMIT = 12; // 5m × 12 = 1h rolling
const OI_1H_LIMIT = 6; //  1h × 6  = 6h rolling
const LS_1H_LIMIT = 6; //  1h × 6  = 6h rolling
const TAKER_1H_LIMIT = 6; //  1h × 6  = 6h rolling
const FORCE_ORDERS_1H_LIMIT = 50; // §10 Q6 — primary window
const FORCE_ORDERS_4H_LIMIT = 200; // §10 Q6 — regime-context window

// ---------------------------------------------------------------------------
// Shared fetch + memoize for compound sources
// ---------------------------------------------------------------------------
//
// `fetchBtcOnchain` and `fetchMempool` each return a compound payload that
// is sliced into 3 and 5 raws respectively. We wrap them in a 30-second
// promise memo so one compound request fills every slice without spamming
// the upstream. This memo is intentionally simple — the provider-level
// `cache.ts` layer owns the persistent TTL cache. This is only the
// in-flight dedupe.

let btcOnchainInflight: Promise<Awaited<ReturnType<typeof fetchBtcOnchain>>> | null = null;
let btcOnchainAt = 0;
function getBtcOnchain() {
	const now = Date.now();
	if (btcOnchainInflight && now - btcOnchainAt < 30_000) return btcOnchainInflight;
	btcOnchainAt = now;
	btcOnchainInflight = fetchBtcOnchain().catch((err) => {
		btcOnchainInflight = null;
		throw err;
	});
	return btcOnchainInflight;
}

let mempoolInflight: Promise<Awaited<ReturnType<typeof fetchMempool>>> | null = null;
let mempoolAt = 0;
function getMempool() {
	const now = Date.now();
	if (mempoolInflight && now - mempoolAt < 30_000) return mempoolInflight;
	mempoolAt = now;
	mempoolInflight = fetchMempool().catch((err) => {
		mempoolInflight = null;
		throw err;
	});
	return mempoolInflight;
}

// ---------------------------------------------------------------------------
// premiumIndex memo (funding rate + mark price)
// ---------------------------------------------------------------------------
//
// `fapi/v1/premiumIndex?symbol=X` returns both `lastFundingRate` and
// `markPrice` in one payload. Scanner, tool executor, and the cogochi
// analyze endpoint historically owned private `fetchDerivatives()` helpers
// that reached into `fapi.binance.com` directly. Those helpers are gone
// in B7; all three consumers now go through `readRaw()` for FUNDING_RATE,
// MARK_PRICE, OPEN_INTEREST_POINT, and LONG_SHORT_TOP_1H.
//
// Moving premiumIndex into this memo ensures the FUNDING_RATE and
// MARK_PRICE atoms, when both are read for the same symbol, do not
// produce two network calls. The 5-second TTL matches Binance's typical
// funding-rate update cadence on the engine path.

interface PremiumIndexPayload {
	fundingRate: number | null;
	markPrice: number | null;
}

const premiumIndexInflight = new Map<string, Promise<PremiumIndexPayload>>();
const premiumIndexAt = new Map<string, number>();

async function fetchPremiumIndex(symbol: string): Promise<PremiumIndexPayload> {
	const res = await fetch(
		`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${symbol}`,
		{ signal: AbortSignal.timeout(5000) }
	);
	if (!res.ok) throw new Error(`premiumIndex ${res.status}`);
	const data = (await res.json()) as { lastFundingRate?: string; markPrice?: string };
	const fundingRate = data.lastFundingRate != null ? parseFloat(data.lastFundingRate) : null;
	const markPrice = data.markPrice != null ? parseFloat(data.markPrice) : null;
	return {
		fundingRate: Number.isFinite(fundingRate as number) ? fundingRate : null,
		markPrice: Number.isFinite(markPrice as number) ? markPrice : null
	};
}

function getPremiumIndex(symbol: string): Promise<PremiumIndexPayload> {
	const now = Date.now();
	const existing = premiumIndexInflight.get(symbol);
	const lastAt = premiumIndexAt.get(symbol) ?? 0;
	if (existing && now - lastAt < 5_000) return existing;
	premiumIndexAt.set(symbol, now);
	const promise = binanceQuota.execute(() => fetchPremiumIndex(symbol)).catch((err) => {
		premiumIndexInflight.delete(symbol);
		throw err;
	});
	premiumIndexInflight.set(symbol, promise);
	return promise;
}

// ---------------------------------------------------------------------------
// openInterest (point-in-time) memo
// ---------------------------------------------------------------------------
//
// `fapi/v1/openInterest?symbol=X` is a scalar read — one number representing
// the current outstanding open-interest notional. Previously `scanner.ts`,
// `toolExecutor.ts`, and the cogochi analyze endpoint each owned a private
// inline fetcher. This memo dedupes concurrent reads for the same symbol
// within a 5-second window (matches the binance OI update cadence on the
// engine path). Errors return null so callers can degrade gracefully — OI
// is a supporting signal, not a gating one.

const openInterestInflight = new Map<string, Promise<number | null>>();
const openInterestAt = new Map<string, number>();

async function fetchOpenInterestPoint(symbol: string): Promise<number | null> {
	try {
		const res = await fetch(
			`https://fapi.binance.com/fapi/v1/openInterest?symbol=${symbol}`,
			{ signal: AbortSignal.timeout(5000) }
		);
		if (!res.ok) return null;
		const data = (await res.json()) as { openInterest?: string };
		const oi = data.openInterest != null ? parseFloat(data.openInterest) : null;
		return Number.isFinite(oi as number) ? oi : null;
	} catch {
		return null;
	}
}

function getOpenInterestPoint(symbol: string): Promise<number | null> {
	const now = Date.now();
	const existing = openInterestInflight.get(symbol);
	const lastAt = openInterestAt.get(symbol) ?? 0;
	if (existing && now - lastAt < 5_000) return existing;
	openInterestAt.set(symbol, now);
	const promise = binanceQuota.execute(() => fetchOpenInterestPoint(symbol)).catch(() => null);
	openInterestInflight.set(symbol, promise);
	return promise;
}

// ---------------------------------------------------------------------------
// topLongShortAccountRatio (1h, 1 bar) memo
// ---------------------------------------------------------------------------
//
// `futures/data/topLongShortAccountRatio?symbol=X&period=1h&limit=1` returns
// a 1-element array with the current top-trader long/short account ratio.
// Dissection §10 Q1 locks the timeframe at `period=1h limit=1` — callers
// cannot override. Previously this endpoint was fetched inline from 3
// different call sites with slightly different error handling. This memo
// gives one canonical path + 5-second in-flight dedupe + null-on-error.

const longShortTopInflight = new Map<string, Promise<number | null>>();
const longShortTopAt = new Map<string, number>();

async function fetchLongShortTop1h(symbol: string): Promise<number | null> {
	try {
		const res = await fetch(
			`https://fapi.binance.com/futures/data/topLongShortAccountRatio?symbol=${symbol}&period=1h&limit=1`,
			{ signal: AbortSignal.timeout(5000) }
		);
		if (!res.ok) return null;
		const data = (await res.json()) as Array<{ longShortRatio?: string }>;
		if (!Array.isArray(data) || data.length === 0) return null;
		const r = data[0].longShortRatio != null ? parseFloat(data[0].longShortRatio) : null;
		return Number.isFinite(r as number) ? r : null;
	} catch {
		return null;
	}
}

function getLongShortTop1h(symbol: string): Promise<number | null> {
	const now = Date.now();
	const existing = longShortTopInflight.get(symbol);
	const lastAt = longShortTopAt.get(symbol) ?? 0;
	if (existing && now - lastAt < 5_000) return existing;
	longShortTopAt.set(symbol, now);
	const promise = binanceQuota.execute(() => fetchLongShortTop1h(symbol)).catch(() => null);
	longShortTopInflight.set(symbol, promise);
	return promise;
}

// ---------------------------------------------------------------------------
// Adapter map
// ---------------------------------------------------------------------------
//
// Each entry is a strictly-typed async function bound to one `KnownRawId`.
// The caller shape is enforced by `RawSourceInputs[ID]`. The return shape
// is enforced by `RawSourceOutputs[ID]`.
//
// NOTE: the map is exported as `readonly` so consumers cannot mutate it.
// Adding new raws requires extending this file (and the two type maps
// above) in a later slice.

type RawSourceFetch<ID extends SupportedRawId> = (
	input: RawSourceInputs[ID]
) => Promise<RawSourceOutputs[ID]>;

type RawSourceMap = {
	readonly [ID in SupportedRawId]: RawSourceFetch<ID>;
};

export const rawSources: RawSourceMap = {
	[KnownRawId.FEAR_GREED_VALUE]: async () => {
		const snap = await fetchFearGreed(1);
		return snap.current?.value ?? null;
	},
	[KnownRawId.USD_KRW_RATE]: async () => fetchUsdKrw(),

	[KnownRawId.BTC_N_TX_24H]: async () => (await getBtcOnchain()).nTx,
	[KnownRawId.BTC_TOTAL_SENT_24H]: async () => (await getBtcOnchain()).totalBtcSent,
	[KnownRawId.BTC_AVG_TX_VALUE]: async () => (await getBtcOnchain()).avgTxValue,

	[KnownRawId.MEMPOOL_PENDING_TX]: async () => (await getMempool()).count,
	[KnownRawId.MEMPOOL_VSIZE_MB]: async () => (await getMempool()).vsize / 1_000_000,
	[KnownRawId.MEMPOOL_FASTEST_FEE]: async () => (await getMempool()).fastestFee,
	[KnownRawId.MEMPOOL_HALFHOUR_FEE]: async () => (await getMempool()).halfHourFee,
	[KnownRawId.MEMPOOL_HOUR_FEE]: async () => (await getMempool()).hourFee,

	// Klines — one raw per timeframe, caller supplies the lookback limit.
	// `fetchKlinesServer` owns its own TTL cache keyed on
	// `${symbol}:${interval}:${limit}`, so the provider wrapper only needs
	// to hold the quota slot.
	[KnownRawId.KLINES_1M]: async ({ symbol, limit }) =>
		binanceQuota.execute(() => fetchKlinesServer(symbol, '1m', limit)),
	[KnownRawId.KLINES_5M]: async ({ symbol, limit }) =>
		binanceQuota.execute(() => fetchKlinesServer(symbol, '5m', limit)),
	[KnownRawId.KLINES_15M]: async ({ symbol, limit }) =>
		binanceQuota.execute(() => fetchKlinesServer(symbol, '15m', limit)),
	[KnownRawId.KLINES_30M]: async ({ symbol, limit }) =>
		binanceQuota.execute(() => fetchKlinesServer(symbol, '30m', limit)),
	[KnownRawId.KLINES_1H]: async ({ symbol, limit }) =>
		binanceQuota.execute(() => fetchKlinesServer(symbol, '1h', limit)),
	[KnownRawId.KLINES_4H]: async ({ symbol, limit }) =>
		binanceQuota.execute(() => fetchKlinesServer(symbol, '4h', limit)),
	[KnownRawId.KLINES_1D]: async ({ symbol, limit }) =>
		binanceQuota.execute(() => fetchKlinesServer(symbol, '1d', limit)),
	[KnownRawId.KLINES_1W]: async ({ symbol, limit }) =>
		binanceQuota.execute(() => fetchKlinesServer(symbol, '1w', limit)),

	// Per-symbol spot 24hr ticker. `fetch24hrServer` caches internally.
	[KnownRawId.TICKER_24HR]: async ({ symbol }) =>
		binanceQuota.execute(() => fetch24hrServer(symbol)),

	// FUNDING_RATE + MARK_PRICE share one upstream (`fapi/v1/premiumIndex`).
	// The memo dedupes paired reads for the same symbol within a 5s window.
	[KnownRawId.FUNDING_RATE]: async ({ symbol }) => (await getPremiumIndex(symbol)).fundingRate,
	[KnownRawId.MARK_PRICE]: async ({ symbol }) => (await getPremiumIndex(symbol)).markPrice,

	// Point-in-time open interest + top-trader long/short ratio.
	// Both return `number | null` and are memoized for 5s to dedupe the
	// concurrent reads issued by scanner, toolExecutor, and the cogochi
	// analyze endpoint. Errors collapse to null.
	[KnownRawId.OPEN_INTEREST_POINT]: async ({ symbol }) => getOpenInterestPoint(symbol),
	[KnownRawId.LONG_SHORT_TOP_1H]: async ({ symbol }) => getLongShortTop1h(symbol),

	[KnownRawId.DEPTH_L2_20]: async ({ symbol }) =>
		binanceQuota.execute(() => fetchDepth(symbol, 20)),

	// §10 Q1 — fixed timeframe authority, callers cannot override
	[KnownRawId.OI_HIST_5M]: async ({ symbol }) =>
		binanceQuota.execute(() => fetchOIHistory(symbol, '5m', OI_5M_LIMIT)),
	[KnownRawId.OI_HIST_1H]: async ({ symbol }) =>
		binanceQuota.execute(() => fetchOIHistory(symbol, '1h', OI_1H_LIMIT)),
	[KnownRawId.LONG_SHORT_GLOBAL]: async ({ symbol }) =>
		binanceQuota.execute(() => fetchGlobalLS(symbol, '1h', LS_1H_LIMIT)),
	[KnownRawId.TAKER_BUY_SELL_RATIO]: async ({ symbol }) =>
		binanceQuota.execute(() => fetchTakerRatio(symbol, '1h', TAKER_1H_LIMIT)),

	// §10 Q6 — 1h primary + 4h regime-context
	[KnownRawId.FORCE_ORDERS_1H]: async ({ symbol }) =>
		binanceQuota.execute(() => fetchForceOrders(symbol, FORCE_ORDERS_1H_LIMIT)),
	[KnownRawId.FORCE_ORDERS_4H]: async ({ symbol }) =>
		binanceQuota.execute(() => fetchForceOrders(symbol, FORCE_ORDERS_4H_LIMIT)),

	// KRW exchange price maps — the volume map is deliberately absent
	// in this slice; `fetchUpbitPrices` only returns prices and there
	// is no `fetchUpbitVolumes` yet. Will land with a follow-up.
	[KnownRawId.UPBIT_PRICE_MAP]: async () => fetchUpbitPrices(),
	[KnownRawId.BITHUMB_PRICE_MAP]: async () => fetchBithumbPrices(),

	// BTC dominance (CoinGecko /global endpoint). Returns a percentage
	// 0-100, or null when the upstream is unavailable.
	[KnownRawId.BTC_DOMINANCE]: async () => {
		const v = await fetchBtcDominance();
		return v > 0 ? v : null;
	}
};

// ---------------------------------------------------------------------------
// Generic entry point
// ---------------------------------------------------------------------------

/**
 * Read one raw source by its `KnownRawId` symbol. Returns a strictly typed
 * result based on the per-ID entry in `RawSourceOutputs`.
 *
 * Example:
 *   const fng = await readRaw(KnownRawId.FEAR_GREED_VALUE, {});
 *   //    ^? number | null
 *
 *   const depth = await readRaw(KnownRawId.DEPTH_L2_20, { symbol: 'BTCUSDT' });
 *   //    ^? OrderBookSnapshot
 */
export async function readRaw<ID extends SupportedRawId>(
	id: ID,
	input: RawSourceInputs[ID]
): Promise<RawSourceOutputs[ID]> {
	const fetcher = rawSources[id] as RawSourceFetch<ID>;
	return fetcher(input);
}

/** Returns true if `id` is implemented by the adapter map. */
export function isSupportedRawId(id: string): id is SupportedRawId {
	return id in rawSources;
}

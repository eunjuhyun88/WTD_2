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
//   `OI_HIST_DISPLAY_TF` id (B11: wired — see the interval-keyed
//   `OI_DISPLAY_TF_LIMITS` table and the rawSources map entry below).
//   DISPLAY_TF retains the "adapter authorizes limits" principle —
//   callers pick the interval, but the per-TF limit is locked here.
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
	// B11: display-TF OI history — caller picks interval, adapter picks limit.
	[KnownRawId.OI_HIST_DISPLAY_TF]: { symbol: string; interval: OIHistoryInterval };
	[KnownRawId.LONG_SHORT_GLOBAL]: { symbol: string };
	[KnownRawId.LONG_SHORT_TOP_1H]: { symbol: string };
	[KnownRawId.TAKER_BUY_SELL_RATIO]: { symbol: string };
	[KnownRawId.FORCE_ORDERS_1H]: { symbol: string };
	[KnownRawId.FORCE_ORDERS_4H]: { symbol: string };
	[KnownRawId.UPBIT_PRICE_MAP]: EmptyInput;
	[KnownRawId.UPBIT_VOLUME_MAP]: EmptyInput;
	[KnownRawId.BITHUMB_PRICE_MAP]: EmptyInput;
	[KnownRawId.BTC_DOMINANCE]: EmptyInput;
	// B12: futures-wide 24hr ticker field slices. All seven atoms share
	// one memoized `/fapi/v1/ticker/24hr` roundtrip and return map/set
	// shapes keyed by symbol, so callers can look up O(1) without
	// re-scanning the 500+ row payload.
	[KnownRawId.TICKER_SYMBOL]: EmptyInput;
	[KnownRawId.TICKER_QUOTE_VOLUME]: EmptyInput;
	[KnownRawId.TICKER_PRICE_CHANGE_PCT]: EmptyInput;
	[KnownRawId.TICKER_HIGH_PRICE]: EmptyInput;
	[KnownRawId.TICKER_LOW_PRICE]: EmptyInput;
	[KnownRawId.TICKER_LAST_PRICE]: EmptyInput;
	[KnownRawId.UNIVERSE_IS_USDT]: EmptyInput;
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
	// B11: same point shape as the fixed-TF OI raws — compare windows
	// consume the array by index, so the structure is identical to
	// OI_HIST_5M / OI_HIST_1H. Only the length / spacing differs.
	[KnownRawId.OI_HIST_DISPLAY_TF]: OIHistoryPoint[];
	[KnownRawId.LONG_SHORT_GLOBAL]: GlobalLSPoint[];
	[KnownRawId.LONG_SHORT_TOP_1H]: number | null;
	[KnownRawId.TAKER_BUY_SELL_RATIO]: TakerRatioPoint[];
	[KnownRawId.FORCE_ORDERS_1H]: ForceOrder[];
	[KnownRawId.FORCE_ORDERS_4H]: ForceOrder[];
	[KnownRawId.UPBIT_PRICE_MAP]: Map<string, number>;
	[KnownRawId.UPBIT_VOLUME_MAP]: Map<string, number>;
	[KnownRawId.BITHUMB_PRICE_MAP]: Map<string, number>;
	[KnownRawId.BTC_DOMINANCE]: number | null;
	// B12: each entry is the USDT-filtered futures universe view of one
	// field on Binance's `/fapi/v1/ticker/24hr` response. Keys are the
	// normalized perpetual symbol (e.g. `BTCUSDT`); values are the
	// field at that row. TICKER_SYMBOL and UNIVERSE_IS_USDT return the
	// set of symbols rather than a map because their job is membership,
	// not value lookup — they are distinct contract IDs even though
	// the underlying data is identical (see §7 / §8 of the notes in
	// `getFuturesTickers()` below).
	[KnownRawId.TICKER_SYMBOL]: Set<string>;
	[KnownRawId.TICKER_QUOTE_VOLUME]: Map<string, number>;
	[KnownRawId.TICKER_PRICE_CHANGE_PCT]: Map<string, number>;
	[KnownRawId.TICKER_HIGH_PRICE]: Map<string, number>;
	[KnownRawId.TICKER_LOW_PRICE]: Map<string, number>;
	[KnownRawId.TICKER_LAST_PRICE]: Map<string, number>;
	[KnownRawId.UNIVERSE_IS_USDT]: Set<string>;
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

// B11: OI_HIST_DISPLAY_TF — caller-supplied interval, adapter-authored limit.
//
// Unlike OI_HIST_5M / OI_HIST_1H (fixed-period engine raws used for
// rolling point-in-time stats), DISPLAY_TF feeds the research-view
// block that needs compare windows up to 7d across any user-selected
// display timeframe. Each interval gets a limit tuned to:
//   (a) stay under Binance's `/futures/data/openInterestHist` 500-row
//       hard cap,
//   (b) provide enough bars for rolling z-score (window ≈ 50) and
//       regime tagging (window ≈ 40), and
//   (c) cover the longest research-view compare window the TF is
//       physically capable of spanning.
//
// 5m and 15m cannot reach the 7d compare window even at Binance's
// 500-row cap — their limits below are the max useful lookback. The
// research view is responsible for degrading gracefully (null-out the
// 7d comparator) on those TFs; this file only guarantees the fetch
// returns the longest valid window.
//
// The table is declared `as const` so the `OIHistoryInterval` union
// below is derived from the single source of truth and cannot drift.

const OI_DISPLAY_TF_LIMITS = {
	'5m': 288, //  5m × 288 = 24h  — max 24h compare
	'15m': 288, // 15m × 288 = 72h  — 3d window (7d unreachable on 15m)
	'30m': 336, // 30m × 336 = 7d   — exactly spans 7d compare
	'1h': 336, //  1h × 336 = 14d  — 7d compare + regime buffer
	'2h': 240, //  2h × 240 = 20d  — 7d compare + 13d buffer
	'4h': 180, //  4h × 180 = 30d  — monthly regime context
	'6h': 120, //  6h × 120 = 30d  — monthly regime context
	'12h': 100, // 12h × 100 = 50d  — 7-week regime
	'1d': 60 //   1d × 60  = 60d  — 2-month regime
} as const satisfies Record<string, number>;

/**
 * The full set of display-timeframe intervals the B11 adapter accepts.
 * Derived from `OI_DISPLAY_TF_LIMITS` keys so the union cannot drift
 * from the per-interval limit table.
 *
 * Consumers (e.g. the research view OI metric block) type their
 * interval argument against this union so `readRaw` call sites
 * type-check the TF without needing a separate runtime guard.
 */
export type OIHistoryInterval = keyof typeof OI_DISPLAY_TF_LIMITS;

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
// Upbit ticker memo (prices + volumes in one roundtrip)
// ---------------------------------------------------------------------------
//
// Upbit's `/v1/ticker?markets=...` endpoint returns both trade_price and
// acc_trade_volume_24h in the same payload. Before this slice the
// `UPBIT_PRICE_MAP` raw called `fetchUpbitPrices` which threw the volume
// half away, and `UPBIT_VOLUME_MAP` had no backing fetcher at all (see
// the inline comment in the RawSourceMap block below, pre-slice). B10
// lifts both reads through one memoized call so the L8 kimchi premium
// path (prices) and the L3/L12 flow tracking path (volumes) no longer
// cost two HTTP roundtrips when both are requested in the same scan.
//
// The memo window is 30s — matches Upbit's public API rate-limit posture
// and the btcOnchain / mempool compound memos above. Consumers that need
// strictly-fresh data should call the fetcher directly, but nothing in
// the engine path currently does.
//
// Implemented inline here (rather than in `marketDataService.ts`) to
// keep the B-series slice surgical: it touches exactly one file, closes
// the cataloged `UPBIT_VOLUME_MAP` gap, and leaves existing
// `fetchUpbitPrices` consumers in `marketDataService.ts` untouched.

interface UpbitTickerPayload {
	prices: Map<string, number>;
	volumes: Map<string, number>;
}

async function fetchUpbitTickers(): Promise<UpbitTickerPayload> {
	const marketsRes = await fetch(
		'https://api.upbit.com/v1/market/all?isDetails=false',
		{ signal: AbortSignal.timeout(5000) }
	);
	if (!marketsRes.ok) {
		return { prices: new Map(), volumes: new Map() };
	}
	const markets = (await marketsRes.json()) as Array<{ market: string }>;
	const krwMarkets = markets
		.filter((m) => typeof m.market === 'string' && m.market.startsWith('KRW-'))
		.map((m) => m.market);
	if (krwMarkets.length === 0) {
		return { prices: new Map(), volumes: new Map() };
	}

	const tickerRes = await fetch(
		`https://api.upbit.com/v1/ticker?markets=${krwMarkets.join(',')}`,
		{ signal: AbortSignal.timeout(8000) }
	);
	if (!tickerRes.ok) {
		return { prices: new Map(), volumes: new Map() };
	}
	const tickers = (await tickerRes.json()) as Array<{
		market?: string;
		trade_price?: number;
		acc_trade_volume_24h?: number;
	}>;

	const prices = new Map<string, number>();
	const volumes = new Map<string, number>();
	for (const t of tickers) {
		if (typeof t.market !== 'string') continue;
		const base = t.market.replace('KRW-', '');
		if (typeof t.trade_price === 'number' && Number.isFinite(t.trade_price)) {
			prices.set(base, t.trade_price);
		}
		if (
			typeof t.acc_trade_volume_24h === 'number' &&
			Number.isFinite(t.acc_trade_volume_24h)
		) {
			volumes.set(base, t.acc_trade_volume_24h);
		}
	}
	return { prices, volumes };
}

let upbitTickersInflight: Promise<UpbitTickerPayload> | null = null;
let upbitTickersAt = 0;
function getUpbitTickers(): Promise<UpbitTickerPayload> {
	const now = Date.now();
	if (upbitTickersInflight && now - upbitTickersAt < 30_000) {
		return upbitTickersInflight;
	}
	upbitTickersAt = now;
	upbitTickersInflight = fetchUpbitTickers().catch((err) => {
		upbitTickersInflight = null;
		throw err;
	});
	return upbitTickersInflight;
}

// ---------------------------------------------------------------------------
// Binance futures-wide 24hr ticker memo (B12)
// ---------------------------------------------------------------------------
//
// `/fapi/v1/ticker/24hr` returns one row per USDT-margined perpetual
// contract — roughly 500+ entries, ~1 MB payload. Scanner.ts already
// owns a private `fetchAllFuturesTickers` helper that hits the same
// endpoint to drive its 3-group universe selection. B12 lifts the same
// call into `rawSources` as a memoized compound fetch so the seven
// cataloged-but-unwired atoms below can share one roundtrip:
//
//   - TICKER_SYMBOL          → Set<string> of USDT-perp symbols
//   - TICKER_QUOTE_VOLUME    → Map<symbol, usd_volume_24h>
//   - TICKER_PRICE_CHANGE_PCT→ Map<symbol, percent_change_24h>
//   - TICKER_HIGH_PRICE      → Map<symbol, high_24h>
//   - TICKER_LOW_PRICE       → Map<symbol, low_24h>
//   - TICKER_LAST_PRICE      → Map<symbol, last_24h>
//   - UNIVERSE_IS_USDT       → Set<string> of USDT-perp symbols
//
// TICKER_SYMBOL and UNIVERSE_IS_USDT are intentional duplicates at the
// contract layer: TICKER_SYMBOL is a `raw.scan.ticker_24h.*` field
// slice (the identity field of the 24hr ticker row), while
// UNIVERSE_IS_USDT is a `raw.scan.universe.*` membership predicate.
// Consumers that want to cite "which symbols are in the universe"
// should use `UNIVERSE_IS_USDT`; consumers that want a field slice of
// the 24hr ticker should use `TICKER_SYMBOL`. The data is identical
// because the USDT-perp filter happens once at the fetcher edge.
//
// USDT-perp filter: `symbol.endsWith('USDT') && !symbol.includes('_')`
// — matches scanner.ts:86 exactly. The `_` guard drops quarterly /
// delivery contracts like `BTCUSDT_230929`.
//
// 30-second memo TTL matches the other compound memos in this file
// (btcOnchain, mempool, upbit). Binance's 24hr ticker stats refresh
// every second on the bulk endpoint, but the engine path does not
// need sub-second freshness for universe selection. Scanner.ts is
// intentionally NOT migrated in this slice — B12 is additive-only,
// mirroring B10 / B11. A later slice can point scanner.ts at
// `readRaw(KnownRawId.TICKER_*)` and delete its private fetcher.

interface FuturesTickerRow {
	symbol?: string;
	lastPrice?: string;
	priceChangePercent?: string;
	highPrice?: string;
	lowPrice?: string;
	quoteVolume?: string;
}

interface FuturesTickerPayload {
	symbols: Set<string>;
	quoteVolume: Map<string, number>;
	priceChangePct: Map<string, number>;
	highPrice: Map<string, number>;
	lowPrice: Map<string, number>;
	lastPrice: Map<string, number>;
}

function emptyFuturesTickerPayload(): FuturesTickerPayload {
	return {
		symbols: new Set(),
		quoteVolume: new Map(),
		priceChangePct: new Map(),
		highPrice: new Map(),
		lowPrice: new Map(),
		lastPrice: new Map()
	};
}

async function fetchFuturesTickers(): Promise<FuturesTickerPayload> {
	const res = await fetch('https://fapi.binance.com/fapi/v1/ticker/24hr', {
		signal: AbortSignal.timeout(10_000)
	});
	if (!res.ok) return emptyFuturesTickerPayload();
	const rows = (await res.json()) as FuturesTickerRow[];
	if (!Array.isArray(rows)) return emptyFuturesTickerPayload();

	const payload = emptyFuturesTickerPayload();
	for (const row of rows) {
		if (typeof row.symbol !== 'string') continue;
		// USDT-perp filter: same rule scanner.ts applies to drop
		// quarterly / delivery contracts (they carry an underscore).
		if (!row.symbol.endsWith('USDT') || row.symbol.includes('_')) continue;
		const sym = row.symbol;
		payload.symbols.add(sym);

		const qv = row.quoteVolume != null ? parseFloat(row.quoteVolume) : NaN;
		if (Number.isFinite(qv)) payload.quoteVolume.set(sym, qv);

		const pct = row.priceChangePercent != null ? parseFloat(row.priceChangePercent) : NaN;
		if (Number.isFinite(pct)) payload.priceChangePct.set(sym, pct);

		const high = row.highPrice != null ? parseFloat(row.highPrice) : NaN;
		if (Number.isFinite(high)) payload.highPrice.set(sym, high);

		const low = row.lowPrice != null ? parseFloat(row.lowPrice) : NaN;
		if (Number.isFinite(low)) payload.lowPrice.set(sym, low);

		const last = row.lastPrice != null ? parseFloat(row.lastPrice) : NaN;
		if (Number.isFinite(last)) payload.lastPrice.set(sym, last);
	}
	return payload;
}

let futuresTickersInflight: Promise<FuturesTickerPayload> | null = null;
let futuresTickersAt = 0;
function getFuturesTickers(): Promise<FuturesTickerPayload> {
	const now = Date.now();
	if (futuresTickersInflight && now - futuresTickersAt < 30_000) {
		return futuresTickersInflight;
	}
	futuresTickersAt = now;
	futuresTickersInflight = binanceQuota
		.execute(() => fetchFuturesTickers())
		.catch((err) => {
			futuresTickersInflight = null;
			throw err;
		});
	return futuresTickersInflight;
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
	// B11 — display-TF OI history. Caller supplies the interval from
	// the `OIHistoryInterval` union; the per-interval limit is locked
	// above in `OI_DISPLAY_TF_LIMITS` so the §10 Q1 "adapter authorizes
	// limits" principle still holds. No memoization: mirrors the
	// sibling fixed-TF OI atoms above. The `binanceQuota.execute`
	// wrapper owns concurrency on the engine path. Errors propagate —
	// the research view is responsible for catching them the same way
	// it handles the other OI raws.
	[KnownRawId.OI_HIST_DISPLAY_TF]: async ({ symbol, interval }) =>
		binanceQuota.execute(() =>
			fetchOIHistory(symbol, interval, OI_DISPLAY_TF_LIMITS[interval])
		),
	[KnownRawId.LONG_SHORT_GLOBAL]: async ({ symbol }) =>
		binanceQuota.execute(() => fetchGlobalLS(symbol, '1h', LS_1H_LIMIT)),
	[KnownRawId.TAKER_BUY_SELL_RATIO]: async ({ symbol }) =>
		binanceQuota.execute(() => fetchTakerRatio(symbol, '1h', TAKER_1H_LIMIT)),

	// §10 Q6 — 1h primary + 4h regime-context
	[KnownRawId.FORCE_ORDERS_1H]: async ({ symbol }) =>
		binanceQuota.execute(() => fetchForceOrders(symbol, FORCE_ORDERS_1H_LIMIT)),
	[KnownRawId.FORCE_ORDERS_4H]: async ({ symbol }) =>
		binanceQuota.execute(() => fetchForceOrders(symbol, FORCE_ORDERS_4H_LIMIT)),

	// KRW exchange price + volume maps (Upbit). Both atoms share one
	// memoized `getUpbitTickers()` call so a scan that reads both
	// produces a single HTTP roundtrip. B10 slice: UPBIT_VOLUME_MAP
	// moved from "cataloged but unwired" → wired.
	[KnownRawId.UPBIT_PRICE_MAP]: async () => (await getUpbitTickers()).prices,
	[KnownRawId.UPBIT_VOLUME_MAP]: async () => (await getUpbitTickers()).volumes,
	[KnownRawId.BITHUMB_PRICE_MAP]: async () => fetchBithumbPrices(),

	// BTC dominance (CoinGecko /global endpoint). Returns a percentage
	// 0-100, or null when the upstream is unavailable.
	[KnownRawId.BTC_DOMINANCE]: async () => {
		const v = await fetchBtcDominance();
		return v > 0 ? v : null;
	},

	// B12 — futures-wide 24hr ticker field slices. All seven atoms
	// share one memoized `getFuturesTickers()` call (30s TTL) so a
	// scan cycle that touches multiple fields produces exactly one
	// `/fapi/v1/ticker/24hr` roundtrip. USDT-perp filter applied at
	// the fetcher edge. See the memo comment block above for why
	// TICKER_SYMBOL and UNIVERSE_IS_USDT carry identical data under
	// distinct contract IDs.
	[KnownRawId.TICKER_SYMBOL]: async () => (await getFuturesTickers()).symbols,
	[KnownRawId.TICKER_QUOTE_VOLUME]: async () => (await getFuturesTickers()).quoteVolume,
	[KnownRawId.TICKER_PRICE_CHANGE_PCT]: async () => (await getFuturesTickers()).priceChangePct,
	[KnownRawId.TICKER_HIGH_PRICE]: async () => (await getFuturesTickers()).highPrice,
	[KnownRawId.TICKER_LOW_PRICE]: async () => (await getFuturesTickers()).lowPrice,
	[KnownRawId.TICKER_LAST_PRICE]: async () => (await getFuturesTickers()).lastPrice,
	[KnownRawId.UNIVERSE_IS_USDT]: async () => (await getFuturesTickers()).symbols
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

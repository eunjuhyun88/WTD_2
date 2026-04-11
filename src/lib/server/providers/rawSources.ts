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
	type OrderBookSnapshot,
	type OIHistoryPoint,
	type TakerRatioPoint,
	type GlobalLSPoint,
	type ForceOrder
} from '$lib/server/marketDataService';
import { fetchFearGreed } from '$lib/server/feargreed';

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
	[KnownRawId.DEPTH_L2_20]: { symbol: string };
	[KnownRawId.OI_HIST_5M]: { symbol: string };
	[KnownRawId.OI_HIST_1H]: { symbol: string };
	[KnownRawId.LONG_SHORT_GLOBAL]: { symbol: string };
	[KnownRawId.TAKER_BUY_SELL_RATIO]: { symbol: string };
	[KnownRawId.FORCE_ORDERS_1H]: { symbol: string };
	[KnownRawId.FORCE_ORDERS_4H]: { symbol: string };
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
	[KnownRawId.DEPTH_L2_20]: OrderBookSnapshot;
	[KnownRawId.OI_HIST_5M]: OIHistoryPoint[];
	[KnownRawId.OI_HIST_1H]: OIHistoryPoint[];
	[KnownRawId.LONG_SHORT_GLOBAL]: GlobalLSPoint[];
	[KnownRawId.TAKER_BUY_SELL_RATIO]: TakerRatioPoint[];
	[KnownRawId.FORCE_ORDERS_1H]: ForceOrder[];
	[KnownRawId.FORCE_ORDERS_4H]: ForceOrder[];
}

/** The subset of `KnownRawId` values this slice implements. */
export type SupportedRawId = keyof RawSourceInputs & keyof RawSourceOutputs;

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

	[KnownRawId.DEPTH_L2_20]: async ({ symbol }) => fetchDepth(symbol, 20),

	// §10 Q1 — fixed timeframe authority, callers cannot override
	[KnownRawId.OI_HIST_5M]: async ({ symbol }) => fetchOIHistory(symbol, '5m', OI_5M_LIMIT),
	[KnownRawId.OI_HIST_1H]: async ({ symbol }) => fetchOIHistory(symbol, '1h', OI_1H_LIMIT),
	[KnownRawId.LONG_SHORT_GLOBAL]: async ({ symbol }) => fetchGlobalLS(symbol, '1h', LS_1H_LIMIT),
	[KnownRawId.TAKER_BUY_SELL_RATIO]: async ({ symbol }) =>
		fetchTakerRatio(symbol, '1h', TAKER_1H_LIMIT),

	// §10 Q6 — 1h primary + 4h regime-context
	[KnownRawId.FORCE_ORDERS_1H]: async ({ symbol }) => fetchForceOrders(symbol, FORCE_ORDERS_1H_LIMIT),
	[KnownRawId.FORCE_ORDERS_4H]: async ({ symbol }) => fetchForceOrders(symbol, FORCE_ORDERS_4H_LIMIT)
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

// ===================================================================
// Multi-Symbol Scanner Engine
// ===================================================================
// Scans many symbols in parallel using the 17-layer COGOCHI engine.
// 3-Group symbol selection: volume, movers, near-breakout.

import { readRaw } from './providers';
import { KnownRawId } from '$lib/contracts/ids';
import {
  computeServerSignalSnapshot,
  type ServerSignalSnapshot as SignalSnapshot,
} from '$lib/server/cogochi/signalSnapshot';
import type { ServerExtendedMarketData as ExtendedMarketData } from '$lib/server/cogochi/signalSnapshot';
import {
  getScanMarketMaxParallelSymbols,
  mapWithConcurrencyLimit,
} from '$lib/server/scan/concurrency';
import {
  buildBaseSignalSnapshotBundle,
  mapForceOrders,
  toDepthSnapshot,
} from '$lib/server/scan/normalize';

// --- Public types ---------------------------------------------------

export interface ScanResult {
  symbol: string;
  price: number;
  change24h: number;
  volume24h: number;
  alphaScore: number;
  alphaLabel: string;
  verdict: string;
  regime: string;
  hasWyckoff: boolean;
  hasMTF: boolean;
  hasSqueeze: boolean;
  hasLiqAlert: boolean;
  extremeFR: boolean;
  snapshot: SignalSnapshot;
}

export interface ScanConfig {
  mode: 'topN' | 'custom';
  symbols?: string[];      // for custom mode
  topN?: number;           // for topN mode (default 30)
  preset?: string;         // 'top5' | 'top10' | 'top30' | 'ai' | 'defi' | 'meme'
}

// --- Presets --------------------------------------------------------

const PRESETS: Record<string, string[]> = {
  top5: ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT'],
  top10: [
    'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT',
    'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT', 'DOTUSDT', 'LINKUSDT',
  ],
  top30: [
    'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT',
    'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT', 'DOTUSDT', 'LINKUSDT',
    'MATICUSDT', 'LTCUSDT', 'BCHUSDT', 'NEARUSDT', 'UNIUSDT',
    'APTUSDT', 'FILUSDT', 'ARBUSDT', 'OPUSDT', 'ATOMUSDT',
    'ICPUSDT', 'FETUSDT', 'RENDERUSDT', 'INJUSDT', 'SUIUSDT',
    'SEIUSDT', 'TIAUSDT', 'MKRUSDT', 'AAVEUSDT', 'GRTUSDT',
  ],
  ai: ['FETUSDT', 'RENDERUSDT', 'TAOUSDT', 'NEARUSDT', 'GRTUSDT', 'OCEANUSDT'],
  defi: ['UNIUSDT', 'AAVEUSDT', 'MKRUSDT', 'COMPUSDT', 'SNXUSDT', 'CRVUSDT'],
  meme: ['DOGEUSDT', 'SHIBUSDT', 'PEPEUSDT', 'FLOKIUSDT', 'BONKUSDT', 'WIFUSDT'],
};

// --- 3-Group Symbol Selection ---------------------------------------
//
// B13-a migration: the private `fetchAllFuturesTickers()` helper that
// used to live here went direct-to-`fapi.binance.com/fapi/v1/ticker/24hr`
// and duplicated the USDT-perp filter (`endsWith('USDT') && !includes('_')`).
// B12 lifted that same roundtrip into `rawSources.ts` as a
// 30-second-memoized compound fetch exposed via seven `TICKER_*` atoms.
// Scanner now reads those atoms through `readRaw()`, so the scanner path
// and any other downstream that also reads the 24hr ticker (e.g. research
// blocks, tool executor) share a single `/fapi/v1/ticker/24hr` payload
// inside the memo window. No private FAPI fetch remains in this file.

/**
 * 3-Group selection algorithm.
 *
 * Group 1 (50%): Top by 24H quote volume
 * Group 2 (30%): Top by 24H price change % (absolute value)
 * Group 3 (25%): Coins where current price > 90% of 24H range (near breakout)
 *
 * Groups are merged and deduplicated, then trimmed to topN.
 *
 * All universe + field slices flow through `readRaw(KnownRawId.TICKER_*)`.
 * On fetcher failure the B12 memo returns empty Set/Map payloads, so we
 * fall back to `PRESETS.top10` when the universe is empty — identical to
 * the pre-B13a behavior (old `fetchAllFuturesTickers` threw, was caught at
 * the `scanMarket` boundary, and produced the same empty-universe path).
 */
export async function selectSymbols3Group(topN: number): Promise<string[]> {
  const [symbols, quoteVolume, priceChangePct, lastPrice, highPrice, lowPrice] =
    await Promise.all([
      readRaw(KnownRawId.TICKER_SYMBOL, {}),
      readRaw(KnownRawId.TICKER_QUOTE_VOLUME, {}),
      readRaw(KnownRawId.TICKER_PRICE_CHANGE_PCT, {}),
      readRaw(KnownRawId.TICKER_LAST_PRICE, {}),
      readRaw(KnownRawId.TICKER_HIGH_PRICE, {}),
      readRaw(KnownRawId.TICKER_LOW_PRICE, {}),
    ]);

  if (symbols.size === 0) return PRESETS.top10;
  const symArr = Array.from(symbols);

  // Group 1: Top by 24H quote volume (50% of topN)
  const g1Count = Math.ceil(topN * 0.5);
  const group1 = [...symArr]
    .sort((a, b) => (quoteVolume.get(b) ?? 0) - (quoteVolume.get(a) ?? 0))
    .slice(0, g1Count);

  // Group 2: Top by |24H price change %| (30% of topN)
  const g2Count = Math.ceil(topN * 0.3);
  const group2 = [...symArr]
    .sort(
      (a, b) =>
        Math.abs(priceChangePct.get(b) ?? 0) -
        Math.abs(priceChangePct.get(a) ?? 0),
    )
    .slice(0, g2Count);

  // Group 3: Near breakout -- price > 90% of 24H range (25% of topN)
  const g3Count = Math.ceil(topN * 0.25);
  const nearBreakout = symArr
    .map((sym) => {
      const price = lastPrice.get(sym) ?? 0;
      const high = highPrice.get(sym) ?? 0;
      const low = lowPrice.get(sym) ?? 0;
      const range = high - low;
      const pctOfHigh = range > 0 ? (price - low) / range : 0;
      return { symbol: sym, pctOfHigh };
    })
    .filter((t) => t.pctOfHigh >= 0.90)
    .sort((a, b) => b.pctOfHigh - a.pctOfHigh);
  const group3 = nearBreakout.slice(0, g3Count).map((t) => t.symbol);

  // Merge and deduplicate, preserving insertion order
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const sym of [...group1, ...group2, ...group3]) {
    if (!seen.has(sym)) {
      seen.add(sym);
      merged.push(sym);
    }
  }

  return merged.slice(0, topN);
}

// --- Single symbol scan ---------------------------------------------
//
// Per-symbol derivatives (funding rate, open interest, top-trader L/S)
// now flow entirely through `readRaw()`. The old private
// `fetchDerivatives()` helper in this file was a transitional shim while
// OPEN_INTEREST_POINT and LONG_SHORT_TOP_1H atoms did not exist. They
// landed in B7, so the helper is gone and the three atoms are fetched
// alongside the other raw reads below.

async function scanSingleSymbol(
  symbol: string,
  fearGreed: number | null,
): Promise<ScanResult | null> {
  try {
    // All raw reads now flow through `readRaw()`; provider-level
    // `binanceQuota` inside rawSources handles concurrency + interval
    // pacing (the old per-caller `rateLimiter.execute(...)` wrapper is gone).
    const [
      klines, klines1h, klines1d, ticker,
      funding, oiPoint, lsTop,
      depth, oiHist, takerData, forceData,
    ] = await Promise.all([
      readRaw(KnownRawId.KLINES_4H, { symbol, limit: 200 }),
      readRaw(KnownRawId.KLINES_1H, { symbol, limit: 100 }).catch(() => []),
      readRaw(KnownRawId.KLINES_1D, { symbol, limit: 50 }).catch(() => []),
      readRaw(KnownRawId.TICKER_24HR, { symbol }).catch(() => null),
      readRaw(KnownRawId.FUNDING_RATE, { symbol }).catch(() => null),
      readRaw(KnownRawId.OPEN_INTEREST_POINT, { symbol }).catch(() => null),
      readRaw(KnownRawId.LONG_SHORT_TOP_1H, { symbol }).catch(() => null),
      readRaw(KnownRawId.DEPTH_L2_20, { symbol }).catch(() => null),
      readRaw(KnownRawId.OI_HIST_1H, { symbol }).catch(() => []),
      readRaw(KnownRawId.TAKER_BUY_SELL_RATIO, { symbol }).catch(() => []),
      readRaw(KnownRawId.FORCE_ORDERS_1H, { symbol }).catch(() => []),
    ]);

    if (!klines || klines.length === 0) return null;

    const bundle = buildBaseSignalSnapshotBundle({
      symbol,
      timeframe: '4h',
      klines,
      klines1h,
      klines1d,
      ticker,
      funding,
      oiPoint,
      lsTop,
      fearGreed,
      oiHistory: oiHist,
      takerData,
    });

    const ext: ExtendedMarketData = {
      currentPrice: bundle.currentPrice,
      priceChangePct: bundle.change24h,
      oiChangePct: bundle.oiChangePct,
      takerRatio: bundle.takerRatio ?? 1.0,
      depth: toDepthSnapshot(depth),
      forceOrders: mapForceOrders(forceData),
      klines1dExt: bundle.klines1dExt,
    };

    // Compute 17-layer signal snapshot
    const snapshot = computeServerSignalSnapshot(bundle.marketContext, symbol, '4h', ext);

    // Determine notable flags
    const hasWyckoff =
      snapshot.l1.phase === 'ACCUMULATION' ||
      snapshot.l1.phase === 'DISTRIBUTION' ||
      snapshot.l1.phase === 'REACCUM' ||
      snapshot.l1.phase === 'REDIST';
    const hasMTF = snapshot.mtfTriple;
    const hasSqueeze = snapshot.l14.bb_squeeze || snapshot.l14.bb_big_squeeze;
    const hasLiqAlert = snapshot.l9.label !== 'QUIET';

    return {
      symbol,
      price: bundle.currentPrice,
      change24h: bundle.change24h,
      volume24h: bundle.volume24h,
      alphaScore: snapshot.alphaScore,
      alphaLabel: snapshot.alphaLabel,
      verdict: snapshot.verdict,
      regime: snapshot.regime,
      hasWyckoff,
      hasMTF,
      hasSqueeze,
      hasLiqAlert,
      extremeFR: snapshot.extremeFR,
      snapshot,
    };
  } catch (err) {
    console.error(`[scanner] Failed to scan ${symbol}:`, err);
    return null;
  }
}

// --- Main scan entry point ------------------------------------------

/**
 * Scan multiple symbols using the 17-layer COGOCHI engine.
 *
 * - mode='topN': auto-select symbols via 3-Group algorithm
 * - mode='custom': use provided symbols list
 * - preset: use predefined symbol list (overrides topN selection)
 *
 * Returns results sorted by alphaScore descending.
 */
export async function scanMarket(config: ScanConfig): Promise<ScanResult[]> {
  let symbols: string[];

  if (config.preset && PRESETS[config.preset]) {
    // Preset takes priority
    symbols = PRESETS[config.preset];
  } else if (config.mode === 'custom' && config.symbols && config.symbols.length > 0) {
    // Custom symbol list
    symbols = config.symbols.map((s) => s.toUpperCase());
  } else {
    // topN mode: 3-Group selection
    const limit = config.topN ?? 30;
    symbols = await selectSymbols3Group(limit);
  }

  // Fetch Fear & Greed once (shared across all symbols)
  const fearGreed = await readRaw(KnownRawId.FEAR_GREED_VALUE, {}).catch(() => null);

  // Bound multi-symbol fan-out so cold scans do not stampede upstream reads.
  const settled = await mapWithConcurrencyLimit(
    symbols,
    getScanMarketMaxParallelSymbols(),
    (symbol) => scanSingleSymbol(symbol, fearGreed),
  );

  const results: ScanResult[] = [];
  for (const outcome of settled) {
    if (outcome.status === 'fulfilled' && outcome.value !== null) {
      results.push(outcome.value);
    }
  }

  // Sort by alphaScore descending (strongest signal first)
  results.sort((a, b) => b.alphaScore - a.alphaScore);

  return results;
}

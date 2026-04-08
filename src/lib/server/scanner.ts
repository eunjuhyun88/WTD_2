// ===================================================================
// Multi-Symbol Scanner Engine
// ===================================================================
// Scans many symbols in parallel using the 17-layer COGOCHI engine.
// 3-Group symbol selection: volume, movers, near-breakout.

import {
  rateLimiter,
  fetchDepth,
  fetchOIHistory,
  fetchTakerRatio,
  fetchForceOrders,
  fetchGlobalLS,
} from './marketDataService';
import { fetchKlinesServer, fetch24hrServer } from './binance';
import { computeSignalSnapshot } from '$lib/engine/cogochi/layerEngine';
import type { SignalSnapshot, ExtendedMarketData } from '$lib/engine/cogochi/types';
import type { MarketContext } from '$lib/engine/factorEngine';

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

// --- Binance Futures API constants ----------------------------------

const FAPI = 'https://fapi.binance.com';

// --- 3-Group Symbol Selection ---------------------------------------

interface FuturesTicker {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
  quoteVolume: string;
  highPrice: string;
  lowPrice: string;
}

/**
 * Fetch all USDT perpetual futures tickers from Binance.
 */
async function fetchAllFuturesTickers(): Promise<FuturesTicker[]> {
  const res = await fetch(`${FAPI}/fapi/v1/ticker/24hr`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`futures tickers ${res.status}`);
  const data: FuturesTicker[] = await res.json();
  // Only keep USDT-margined perpetual pairs (filter out quarterly/coin-M)
  return data.filter(
    (t) => t.symbol.endsWith('USDT') && !t.symbol.includes('_'),
  );
}

/**
 * 3-Group selection algorithm.
 *
 * Group 1 (50%): Top by 24H quote volume
 * Group 2 (30%): Top by 24H price change % (absolute value)
 * Group 3 (25%): Coins where current price > 90% of 24H high (near breakout)
 *
 * Groups are merged and deduplicated, then trimmed to topN.
 */
export async function selectSymbols3Group(topN: number): Promise<string[]> {
  const tickers = await fetchAllFuturesTickers();
  if (tickers.length === 0) return PRESETS.top10;

  // Group 1: Top by 24H quote volume (50% of topN)
  const g1Count = Math.ceil(topN * 0.5);
  const byVolume = [...tickers].sort(
    (a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume),
  );
  const group1 = byVolume.slice(0, g1Count).map((t) => t.symbol);

  // Group 2: Top by |24H price change %| (30% of topN)
  const g2Count = Math.ceil(topN * 0.3);
  const byChange = [...tickers].sort(
    (a, b) =>
      Math.abs(parseFloat(b.priceChangePercent)) -
      Math.abs(parseFloat(a.priceChangePercent)),
  );
  const group2 = byChange.slice(0, g2Count).map((t) => t.symbol);

  // Group 3: Near breakout -- price > 90% of 24H high (25% of topN)
  const g3Count = Math.ceil(topN * 0.25);
  const nearBreakout = tickers
    .map((t) => {
      const price = parseFloat(t.lastPrice);
      const high = parseFloat(t.highPrice);
      const low = parseFloat(t.lowPrice);
      const range = high - low;
      const pctOfHigh = range > 0 ? (price - low) / range : 0;
      return { symbol: t.symbol, pctOfHigh };
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

// --- Per-symbol data fetching ---------------------------------------

const FAPI_TIMEOUT = 5_000;

async function fetchDerivatives(symbol: string) {
  const timeout = AbortSignal.timeout(FAPI_TIMEOUT);
  try {
    const [frRes, oiRes] = await Promise.all([
      fetch(`${FAPI}/fapi/v1/premiumIndex?symbol=${symbol}`, { signal: timeout }),
      fetch(`${FAPI}/fapi/v1/openInterest?symbol=${symbol}`, { signal: timeout }),
    ]);

    const fr = frRes.ok ? await frRes.json() : null;
    const oi = oiRes.ok ? await oiRes.json() : null;

    let lsRatio: number | null = null;
    try {
      const lsRes = await fetch(
        `${FAPI}/futures/data/topLongShortAccountRatio?symbol=${symbol}&period=1h&limit=1`,
        { signal: AbortSignal.timeout(FAPI_TIMEOUT) },
      );
      if (lsRes.ok) {
        const lsData = await lsRes.json();
        if (Array.isArray(lsData) && lsData.length > 0) {
          lsRatio = parseFloat(lsData[0].longShortRatio) || null;
        }
      }
    } catch { /* skip */ }

    return {
      funding: fr ? parseFloat(fr.lastFundingRate) : null,
      oi: oi ? parseFloat(oi.openInterest) : null,
      lsRatio,
    };
  } catch {
    return { funding: null, oi: null, lsRatio: null };
  }
}

async function fetchFearGreed(): Promise<number | null> {
  try {
    const res = await fetch('https://api.alternative.me/fng/?limit=1', {
      signal: AbortSignal.timeout(3_000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return parseInt(data?.data?.[0]?.value) || null;
  } catch {
    return null;
  }
}

// --- Single symbol scan ---------------------------------------------

async function scanSingleSymbol(
  symbol: string,
  fearGreed: number | null,
): Promise<ScanResult | null> {
  try {
    // Fetch all data through the rate limiter
    const [klines, klines1h, klines1d, ticker, deriv, depth, oiHist, takerData, forceData] =
      await Promise.all([
        rateLimiter.execute(() => fetchKlinesServer(symbol, '4h', 200)),
        rateLimiter.execute(() => fetchKlinesServer(symbol, '1h', 100)).catch(() => []),
        rateLimiter.execute(() => fetchKlinesServer(symbol, '1d', 50)).catch(() => []),
        rateLimiter.execute(() => fetch24hrServer(symbol)).catch(() => null),
        rateLimiter.execute(() => fetchDerivatives(symbol)),
        rateLimiter.execute(() => fetchDepth(symbol, 20)).catch(() => null),
        rateLimiter.execute(() => fetchOIHistory(symbol, '1h', 6)).catch(() => []),
        rateLimiter.execute(() => fetchTakerRatio(symbol, '1h', 6)).catch(() => []),
        rateLimiter.execute(() => fetchForceOrders(symbol, 50)).catch(() => []),
      ]);

    if (!klines || klines.length === 0) return null;

    const currentPrice = klines[klines.length - 1].close;
    const change24h = ticker ? parseFloat(ticker.priceChangePercent) || 0 : 0;
    const volume24h = ticker ? parseFloat(ticker.quoteVolume) || 0 : 0;

    // OI change percentage
    let oiChangePct = 0;
    if (oiHist.length >= 2) {
      const latest = oiHist[oiHist.length - 1].sumOpenInterestValue;
      const prev = oiHist[0].sumOpenInterestValue;
      if (prev > 0) oiChangePct = ((latest - prev) / prev) * 100;
    }

    // Taker buy/sell ratio (most recent)
    const latestTaker = takerData.length > 0 ? takerData[takerData.length - 1] : null;
    const takerRatio = latestTaker ? latestTaker.buySellRatio : 1.0;

    // Build MarketContext
    const ctx: MarketContext = {
      pair: symbol,
      timeframe: '4h',
      klines,
      klines1h: klines1h.length > 0 ? klines1h : undefined,
      klines1d: klines1d.length > 0 ? klines1d : undefined,
      ticker: ticker
        ? {
            change24h,
            volume24h,
            high24h: parseFloat(ticker.highPrice) || 0,
            low24h: parseFloat(ticker.lowPrice) || 0,
          }
        : undefined,
      derivatives: {
        oi: deriv.oi,
        funding: deriv.funding,
        lsRatio: deriv.lsRatio,
      },
      sentiment: {
        fearGreed,
      },
    };

    // Build ExtendedMarketData
    const ext: ExtendedMarketData = {
      currentPrice,
      priceChangePct: change24h,
      oiChangePct,
      takerRatio,
      depth: depth
        ? { bidVolume: depth.bidVolume, askVolume: depth.askVolume, ratio: depth.ratio }
        : undefined,
      forceOrders: forceData.map((o) => ({
        side: o.side,
        price: o.price,
        qty: o.origQty,
        time: o.time,
      })),
      klines1dExt: klines1d.length > 0
        ? klines1d.map((k) => ({
            time: k.time,
            open: k.open,
            high: k.high,
            low: k.low,
            close: k.close,
            volume: k.volume,
          }))
        : undefined,
    };

    // Compute 17-layer signal snapshot
    const snapshot = computeSignalSnapshot(ctx, symbol, '4h', ext);

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
      price: currentPrice,
      change24h,
      volume24h,
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
  const fearGreed = await fetchFearGreed();

  // Scan all symbols in parallel (rate limiter handles concurrency)
  const promises = symbols.map((symbol) => scanSingleSymbol(symbol, fearGreed));
  const settled = await Promise.allSettled(promises);

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

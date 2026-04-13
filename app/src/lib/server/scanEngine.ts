// ═══════════════════════════════════════════════════════════════
// Stockclaw — Server-side Scan Engine (B-02)
// ═══════════════════════════════════════════════════════════════
// Replaces client-side warroomScan for server context.
// 15 data sources (13 기존 + Santiment + CoinMetrics) → scoring → WarRoomScanResult
// All fetch calls use server modules with LRU caching.

import type { BinanceKline } from '$lib/server/providers/binance';
import type { AgentSignal } from '$lib/data/warroom';
import { AGENT_POOL } from '$lib/engine/agents';

// ── Server-side data fetchers ──
import { pairToSymbol } from '$lib/server/providers/binance';
import { readRaw, klinesRawIdForTimeframe } from '$lib/server/providers/rawSources';
import { KnownRawId } from '$lib/contracts/ids';
import {
  fetchCurrentOIServer,
  fetchCurrentFundingServer,
  fetchPredictedFundingServer,
  fetchLSRatioHistoryServer,
  fetchLiquidationHistoryServer,
  fetchOIHistoryServer,
  fetchFundingHistoryServer,
} from '$lib/server/providers/coinalyze';
import { fetchFearGreed as fetchFearGreedServer } from '$lib/server/feargreed';
import { fetchCoinGeckoGlobal } from '$lib/server/providers/coingecko';
import { fetchGasOracle, estimateExchangeNetflow } from '$lib/server/etherscan';
import { fetchYahooSeries } from '$lib/server/yahooFinance';
import { fetchTopicSocial } from '$lib/server/lunarcrush';
import { fetchSantimentSocial } from '$lib/server/santiment';
import { fetchCoinMetricsData } from '$lib/server/coinmetrics';
import {
  fetchFredMacroData,
  fedFundsToScore,
  yieldCurveToScore,
  m2ToScore,
} from '$lib/server/fred';
import {
  fetchCryptoQuantData as fetchCQServer,
  mvrvToScore,
  nuplToScore,
  exchangeReserveToScore,
  minerFlowToScore,
} from '$lib/server/cryptoquant';
import { getCached, setCache } from './providers/cache';

// ── Performance: 개별 API 타임아웃 + 소스별 캐시 ──────────
const API_TIMEOUT_MS = 5_000;

/** 개별 API 호출에 5초 타임아웃 적용 */
function withTimeout<T>(promise: Promise<T>, label: string, timeoutMs = API_TIMEOUT_MS): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`[scanEngine] ${label} timed out (${timeoutMs}ms)`)), timeoutMs)
    ),
  ]);
}

// 소스별 캐시 TTL (API rate limit 고려)
const CACHE_TTL = {
  coinalyze: 300_000,   // 5분 (50 req/day 제한 → 보존)
  feargreed: 120_000,   // 2분 (변동 느림)
  coingecko: 60_000,    // 1분
  etherscan: 120_000,   // 2분
  yahoo: 300_000,       // 5분 (매크로 지표 변동 느림)
  lunarcrush: 120_000,  // 2분
  fred: 600_000,        // 10분 (일일 데이터)
  cryptoquant: 300_000, // 5분
  santiment: 120_000,   // 2분 (LunarCrush 대체)
  coinmetrics: 300_000, // 5분 (CryptoQuant 대체, 무료 API)
};

/** 캐시 우선 fetch — 캐시 히트면 API 호출 생략 */
async function cachedFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs: number,
  label: string,
): Promise<T> {
  const cached = getCached<T>(key);
  if (cached !== null) return cached;
  const result = await withTimeout(fetcher(), label, API_TIMEOUT_MS);
  if (result !== null && result !== undefined) {
    setCache(key, result, ttlMs);
  }
  return result;
}

// ═══════════════════════════════════════════════════════════════
// Types (mirrored from warroomScan — avoids importing client code)
// ═══════════════════════════════════════════════════════════════

type Vote = AgentSignal['vote'];

export type ScanHighlight = {
  agent: string;
  vote: Vote;
  conf: number;
  note: string;
};

export type WarRoomScanResult = {
  pair: string;
  timeframe: string;
  token: string;
  createdAt: number;
  label: string;
  signals: AgentSignal[];
  consensus: Vote;
  avgConfidence: number;
  summary: string;
  highlights: ScanHighlight[];
};

// ═══════════════════════════════════════════════════════════════
// Scoring Helpers (pure math — inlined to avoid client imports)
// ═══════════════════════════════════════════════════════════════

/** Fear & Greed → contrarian score (-100 to +100) */
function fngToScore(value: number): number {
  return Math.round(-(value - 50) * 2);
}

/** BTC dominance → score */
function btcDominanceToScore(btcDom: number): number {
  return Math.round((btcDom - 50) * 2.5);
}

/** Gas price → activity score */
function gasToActivityScore(gasPriceGwei: number): number {
  if (gasPriceGwei > 50) return 30;
  if (gasPriceGwei > 25) return 15;
  if (gasPriceGwei > 10) return 5;
  if (gasPriceGwei > 5) return 0;
  return -15;
}

/** Exchange netflow → score (based on ETH balance snapshot) */
function netflowToScore(netflowEth: number): number {
  const midpoint = 2_000_000;
  const deviation = (netflowEth - midpoint) / midpoint;
  return Math.round(Math.max(-50, Math.min(50, -deviation * 80)));
}

function whaleActivityToScore(txCount: number): number {
  if (txCount > 500) return -20;
  if (txCount > 300) return -10;
  if (txCount > 100) return 10;
  if (txCount > 50) return 5;
  return -5;
}

function activeAddressesToScore(activeAddr: number): number {
  if (activeAddr > 600_000) return 25;
  if (activeAddr > 500_000) return 15;
  if (activeAddr > 400_000) return 5;
  if (activeAddr > 300_000) return 0;
  if (activeAddr > 200_000) return -10;
  return -20;
}

function exchangeBalanceToScore(balanceEth: number): number {
  const midpoint = 18_000_000;
  const deviation = (balanceEth - midpoint) / midpoint;
  return Math.round(Math.max(-40, Math.min(40, -deviation * 60)));
}

/** LunarCrush sentiment (1-5) → contrarian score */
function sentimentToScore(sentiment: number): number {
  return Math.round(-(sentiment - 3) * 20);
}

function dominanceToScore(dominance: number): number {
  if (dominance > 25) return -25;
  if (dominance > 15) return -10;
  if (dominance < 2) return 10;
  return 0;
}

function galaxyToConfBoost(galaxyScore: number): number {
  if (galaxyScore > 70) return 10;
  if (galaxyScore > 50) return 5;
  return 0;
}

/** DXY → crypto score (inverse correlation) */
function dxyToScore(changePct: number, trend1m: number | null): number {
  let score = 0;
  score += changePct > 0.3 ? -15 : changePct < -0.3 ? 15 : -changePct * 30;
  if (trend1m != null) {
    score += trend1m > 2 ? -20 : trend1m < -2 ? 20 : -trend1m * 8;
  }
  return Math.round(Math.max(-40, Math.min(40, score)));
}

function equityToScore(changePct: number, trend1m: number | null): number {
  let score = 0;
  score += changePct > 0.5 ? 10 : changePct < -0.5 ? -10 : changePct * 15;
  if (trend1m != null) {
    score += trend1m > 3 ? 15 : trend1m < -3 ? -15 : trend1m * 4;
  }
  return Math.round(Math.max(-30, Math.min(30, score)));
}

function yieldToScore(changePct: number): number {
  const score = changePct > 2 ? -20 : changePct < -2 ? 20 : -changePct * 8;
  return Math.round(Math.max(-25, Math.min(25, score)));
}

// ═══════════════════════════════════════════════════════════════
// Computation Helpers
// ═══════════════════════════════════════════════════════════════

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function roundPrice(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (Math.abs(value) >= 1000) return Math.round(value);
  if (Math.abs(value) >= 100) return Number(value.toFixed(2));
  return Number(value.toFixed(4));
}

function fmtPrice(price: number): string {
  if (!Number.isFinite(price)) return '$0';
  if (Math.abs(price) >= 1000) return '$' + price.toLocaleString();
  return '$' + price.toFixed(price >= 100 ? 2 : 4);
}

function fmtCompact(value: number): string {
  if (!Number.isFinite(value)) return '0';
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toFixed(0);
}

function fmtSignedPct(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return '0.00%';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(decimals)}%`;
}

function formatOI(value: number): string {
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function formatFunding(value: number): string {
  return `${(value * 100).toFixed(4)}%`;
}

function computeSMA(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((sum, v) => sum + v, 0) / period;
}

function computeRSI(values: number[], period = 14): number | null {
  if (values.length < period + 1) return null;
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const delta = values[i] - values[i - 1];
    if (delta > 0) avgGain += delta;
    else avgLoss -= delta;
  }
  avgGain /= period;
  avgLoss /= period;
  for (let i = period + 1; i < values.length; i++) {
    const delta = values[i] - values[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(delta, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-delta, 0)) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function computeAtrPct(klines: BinanceKline[], period = 14): number | null {
  if (klines.length < period + 1) return null;
  const range = klines.slice(-(period + 1));
  let totalTR = 0;
  for (let i = 1; i < range.length; i++) {
    const prevClose = range[i - 1].close;
    const cur = range[i];
    const tr = Math.max(
      cur.high - cur.low,
      Math.abs(cur.high - prevClose),
      Math.abs(cur.low - prevClose)
    );
    totalTR += tr;
  }
  const atr = totalTR / period;
  const lastClose = range[range.length - 1].close;
  if (!Number.isFinite(lastClose) || lastClose <= 0) return null;
  return (atr / lastClose) * 100;
}

function scoreToVote(score: number, neutralBand = 0.12): Vote {
  if (score > neutralBand) return 'long';
  if (score < -neutralBand) return 'short';
  return 'neutral';
}

function scoreToConfidence(score: number, base = 58): number {
  const conf = base + Math.abs(score) * 30;
  return Math.round(clamp(conf, 45, 95));
}

function buildTradePlan(entry: number, vote: Vote, score: number, atrPct: number | null) {
  const baseDir = vote === 'neutral' ? (score >= 0 ? 'long' : 'short') : vote;
  const riskPct = atrPct != null ? clamp((atrPct / 100) * 0.9, 0.0035, 0.03) : 0.008;
  const rr = vote === 'neutral' ? 1.35 : 1.8;
  const risk = Math.max(entry * riskPct, entry * 0.0035);
  const sl = baseDir === 'long' ? roundPrice(entry - risk) : roundPrice(entry + risk);
  const tp = baseDir === 'long' ? roundPrice(entry + risk * rr) : roundPrice(entry - risk * rr);
  return { entry: roundPrice(entry), tp, sl };
}

// ═══════════════════════════════════════════════════════════════
// Agent Metadata
// ═══════════════════════════════════════════════════════════════

const AGENT_META = {
  structure: { icon: 'STR', name: AGENT_POOL.STRUCTURE.name, color: AGENT_POOL.STRUCTURE.color },
  flow: { icon: 'FLOW', name: AGENT_POOL.FLOW.name, color: AGENT_POOL.FLOW.color },
  deriv: { icon: 'DER', name: AGENT_POOL.DERIV.name, color: AGENT_POOL.DERIV.color },
  senti: { icon: 'SENT', name: AGENT_POOL.SENTI.name, color: AGENT_POOL.SENTI.color },
  macro: { icon: 'MACRO', name: AGENT_POOL.MACRO.name, color: AGENT_POOL.MACRO.color },
  vpa: { icon: 'VPA', name: AGENT_POOL.VPA.name, color: AGENT_POOL.VPA.color },
  ict: { icon: 'ICT', name: AGENT_POOL.ICT.name, color: AGENT_POOL.ICT.color },
  valuation: { icon: 'VAL', name: AGENT_POOL.VALUATION.name, color: AGENT_POOL.VALUATION.color }
} as const;

// ═══════════════════════════════════════════════════════════════
// Server-side Composite Data Helpers
// ═══════════════════════════════════════════════════════════════

interface EthOnchainLike {
  gas: { safe: number; standard: number; fast: number; baseFee: number } | null;
  exchangeNetflowEth: number | null;
  whaleActivity: number | null;
  activeAddresses: number | null;
  exchangeBalance: number | null;
}

async function fetchEthOnchainServer(): Promise<EthOnchainLike | null> {
  const [gasRes, netflowRes] = await Promise.allSettled([
    fetchGasOracle(),
    estimateExchangeNetflow(),
  ]);

  const gasOracle = gasRes.status === 'fulfilled' ? gasRes.value : null;
  const netflow = netflowRes.status === 'fulfilled' ? netflowRes.value : null;

  if (!gasOracle && netflow == null) return null;

  return {
    gas: gasOracle ? {
      safe: Number(gasOracle.SafeGasPrice),
      standard: Number(gasOracle.ProposeGasPrice),
      fast: Number(gasOracle.FastGasPrice),
      baseFee: Number(gasOracle.suggestBaseFee),
    } : null,
    exchangeNetflowEth: netflow,
    // Dune-based data not yet available server-side — B-05 will add
    whaleActivity: null,
    activeAddresses: null,
    exchangeBalance: null,
  };
}

interface MacroIndicatorLike {
  price: number;
  prevClose: number | null;
  changePct: number | null;
  trend1m: number | null;
}

interface MacroIndicatorsLike {
  dxy: MacroIndicatorLike | null;
  spx: MacroIndicatorLike | null;
  us10y: MacroIndicatorLike | null;
}

async function fetchMacroIndicatorsServer(): Promise<MacroIndicatorsLike | null> {
  const [dxyRes, spxRes, us10yRes] = await Promise.allSettled([
    fetchYahooSeries('DX-Y.NYB', '1mo', '1d'),
    fetchYahooSeries('^GSPC', '1mo', '1d'),
    fetchYahooSeries('^TNX', '1mo', '1d'),
  ]);

  function toMacroIndicator(series: typeof dxyRes): MacroIndicatorLike | null {
    if (series.status !== 'fulfilled' || !series.value) return null;
    const s = series.value;
    const pts = s.points;
    const price = s.regularMarketPrice ?? (pts.length > 0 ? pts[pts.length - 1].close : 0);
    const changePct = s.regularMarketChangePercent ?? null;

    // Compute 1-month trend: % change from first to last point
    let trend1m: number | null = null;
    if (pts.length >= 2) {
      const first = pts[0].close;
      const last = pts[pts.length - 1].close;
      if (first > 0) trend1m = ((last - first) / first) * 100;
    }

    return {
      price,
      prevClose: s.previousClose,
      changePct,
      trend1m,
    };
  }

  const dxy = toMacroIndicator(dxyRes);
  const spx = toMacroIndicator(spxRes);
  const us10y = toMacroIndicator(us10yRes);

  if (!dxy && !spx && !us10y) return null;
  return { dxy, spx, us10y };
}

// ═══════════════════════════════════════════════════════════════
// Concurrency Control
// ═══════════════════════════════════════════════════════════════

const MAX_CONCURRENT_SCANS = 8;
const SCAN_CACHE_TTL_MS = 30_000;

let _activeScanCount = 0;
const _inflightScans = new Map<string, Promise<WarRoomScanResult>>();

interface CachedScanResult {
  result: WarRoomScanResult;
  expiresAt: number;
}
const _scanCache = new Map<string, CachedScanResult>();

let _scanCacheCleanupTimer: ReturnType<typeof setInterval> | null = null;
function ensureScanCacheCleanup() {
  if (_scanCacheCleanupTimer) return;
  _scanCacheCleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of _scanCache.entries()) {
      if (now > v.expiresAt) _scanCache.delete(k);
    }
    if (_scanCache.size > 100) {
      const entries = [..._scanCache.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt);
      const toRemove = _scanCache.size - 80;
      for (let i = 0; i < toRemove; i++) _scanCache.delete(entries[i][0]);
    }
  }, 60_000);
  if (_scanCacheCleanupTimer && typeof _scanCacheCleanupTimer === 'object' && 'unref' in _scanCacheCleanupTimer) {
    (_scanCacheCleanupTimer as NodeJS.Timeout).unref();
  }
}

// ═══════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════

/**
 * Server-side scan entry point — equivalent to warroomScan.runWarRoomScan()
 * but fetches all data using server modules (with caching).
 */
export async function runServerScan(pair: string, timeframe: string): Promise<WarRoomScanResult> {
  ensureScanCacheCleanup();

  const marketPair = (pair || 'BTC/USDT').toUpperCase();
  const tf = String(timeframe || '4h');
  const cacheKey = `scanEngine:${marketPair}:${tf}`;

  // 1. Cache hit
  const cached = _scanCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.result;
  }

  // 2. Coalesce duplicate requests
  const inflight = _inflightScans.get(cacheKey);
  if (inflight) return inflight;

  // 3. Concurrency gate
  if (_activeScanCount >= MAX_CONCURRENT_SCANS) {
    if (cached) return cached.result;
    throw new Error('Server scan capacity reached. Please try again shortly.');
  }

  // 4. Run scan
  const scanPromise = (async () => {
    _activeScanCount++;
    try {
      const result = await _runServerScanInternal(marketPair, tf);
      _scanCache.set(cacheKey, { result, expiresAt: Date.now() + SCAN_CACHE_TTL_MS });
      return result;
    } finally {
      _activeScanCount--;
      _inflightScans.delete(cacheKey);
    }
  })();

  _inflightScans.set(cacheKey, scanPromise);
  return scanPromise;
}

// ═══════════════════════════════════════════════════════════════
// Internal Scan Logic
// ═══════════════════════════════════════════════════════════════

async function _runServerScanInternal(pair: string, timeframe: string): Promise<WarRoomScanResult> {
  const marketPair = pair || 'BTC/USDT';
  const tf = String(timeframe || '4h');
  const token = (marketPair.split('/')[0] || 'BTC').toUpperCase();
  const symbol = pairToSymbol(marketPair);

  // ── Phase 1: Core data (Binance klines + ticker) ──
  // B9: final scanEngine → readRaw migration. scanService already
  // validates `tf` against the canonical set (1m/5m/15m/30m/1h/4h/1d/1w),
  // so `klinesRawIdForTimeframe` never hits its defensive fallback on
  // the primary path. The compare endpoint passes through unnormalized
  // timeframes — aberrant input now coerces to KLINES_4H instead of
  // silently fetching a wrong-granularity atom.
  const [klinesRes, tickerRes] = await Promise.allSettled([
    readRaw(klinesRawIdForTimeframe(tf), { symbol, limit: 240 }),
    readRaw(KnownRawId.TICKER_24HR, { symbol }),
  ]);

  if (klinesRes.status !== 'fulfilled') {
    throw new Error('Failed to load candle data from Binance.');
  }
  const klines = klinesRes.value;
  const ticker = tickerRes.status === 'fulfilled'
    ? tickerRes.value
    : { priceChangePercent: '0', quoteVolume: '0' };

  if (!Array.isArray(klines) || klines.length < 60) {
    throw new Error('Insufficient candle data for scan.');
  }

  // ── Phase 2: 13 data sources (parallel, 5s timeout, 소스별 캐시) ──
  const cqAsset = token === 'ETH' ? 'eth' : 'btc';
  const [
    oiRaw, fundingRaw, predFundingRaw, lsRaw, liqRaw,
    fngRaw, cgGlobalRaw, ethOnchainRaw,
    macroRaw, socialRaw, oiHistRaw,
    fredRaw, cqRaw,
    santimentRaw, coinMetricsRaw,
    fundingHistRaw,
  ] = await Promise.allSettled([
    cachedFetch(`ca:oi:${marketPair}`, () => fetchCurrentOIServer(marketPair), CACHE_TTL.coinalyze, 'Coinalyze OI'),
    cachedFetch(`ca:fr:${marketPair}`, () => fetchCurrentFundingServer(marketPair), CACHE_TTL.coinalyze, 'Coinalyze FR'),
    cachedFetch(`ca:pfr:${marketPair}`, () => fetchPredictedFundingServer(marketPair), CACHE_TTL.coinalyze, 'Coinalyze PredFR'),
    cachedFetch(`ca:ls:${marketPair}:${tf}`, () => fetchLSRatioHistoryServer(marketPair, tf, 24), CACHE_TTL.coinalyze, 'Coinalyze LS'),
    cachedFetch(`ca:liq:${marketPair}:${tf}`, () => fetchLiquidationHistoryServer(marketPair, tf, 24), CACHE_TTL.coinalyze, 'Coinalyze Liq'),
    cachedFetch('fng:latest', () => fetchFearGreedServer(), CACHE_TTL.feargreed, 'FearGreed'),
    cachedFetch('cg:global', () => fetchCoinGeckoGlobal(), CACHE_TTL.coingecko, 'CoinGecko'),
    cachedFetch('eth:onchain', () => fetchEthOnchainServer(), CACHE_TTL.etherscan, 'Etherscan'),
    cachedFetch('yahoo:macro', () => fetchMacroIndicatorsServer(), CACHE_TTL.yahoo, 'Yahoo Macro'),
    cachedFetch(`lc:${token}`, () => fetchTopicSocial(token.toLowerCase()), CACHE_TTL.lunarcrush, 'LunarCrush'),
    cachedFetch(`ca:oih:${marketPair}:${tf}`, () => fetchOIHistoryServer(marketPair, tf, 24), CACHE_TTL.coinalyze, 'Coinalyze OIHist'),
    cachedFetch('fred:macro', () => fetchFredMacroData(), CACHE_TTL.fred, 'FRED'),
    cachedFetch(`cq:${cqAsset}`, () => fetchCQServer(cqAsset), CACHE_TTL.cryptoquant, 'CryptoQuant'),
    // Slot 13: Santiment (LunarCrush 대체 — primary)
    cachedFetch(`san:${token}`, () => fetchSantimentSocial(token.toLowerCase()), CACHE_TTL.santiment, 'Santiment'),
    // Slot 14: Coin Metrics (CryptoQuant 대체 — 무료, 키 불필요)
    cachedFetch(`cm:${cqAsset}`, () => fetchCoinMetricsData(cqAsset), CACHE_TTL.coinmetrics, 'CoinMetrics'),
    // Slot 15: Funding history (for 7d avg funding)
    cachedFetch(`ca:frh:${marketPair}`, () => fetchFundingHistoryServer(marketPair, '1h', 168), CACHE_TTL.coinalyze, 'Coinalyze FundingHist'),
  ]);

  // ── Phase 3: Data Consolidation ──
  const now = Date.now();
  const timeLabel = new Date(now).toTimeString().slice(0, 5);
  const scanRunId = `${now}-${Math.floor(Math.random() * 1_000_000).toString(16)}`;
  const latest = klines[klines.length - 1];
  const closes = klines.map((k) => k.close);

  const latestClose = latest.close;
  const latestVolume = latest.volume;
  const avgVolume20 = klines.slice(-20).reduce((sum, k) => sum + k.volume, 0) / Math.max(1, Math.min(20, klines.length));
  const volumeRatio = avgVolume20 > 0 ? latestVolume / avgVolume20 : 1;
  const rsi14 = computeRSI(closes, 14);
  const sma20 = computeSMA(closes, 20);
  const sma60 = computeSMA(closes, 60);
  const sma120 = computeSMA(closes, 120);
  const atrPct = computeAtrPct(klines, 14);

  const change24 = Number(ticker.priceChangePercent || 0);
  const quoteVolume24 = Number(ticker.quoteVolume || 0);

  // ── Funding avg 7d ──
  const fundingHist = fundingHistRaw.status === 'fulfilled' ? fundingHistRaw.value : [];
  const fundingAvg7d = Array.isArray(fundingHist) && fundingHist.length > 0
    ? fundingHist.reduce((sum, d) => sum + (d.value ?? 0), 0) / fundingHist.length
    : null;

  // ── Quick-win price changes from klines ──
  const change1h = closes.length >= 2
    ? ((latestClose - closes[Math.max(0, closes.length - 2)]) / closes[Math.max(0, closes.length - 2)]) * 100
    : null;
  const change4h = closes.length >= 5
    ? ((latestClose - closes[Math.max(0, closes.length - 5)]) / closes[Math.max(0, closes.length - 5)]) * 100
    : null;
  const change7d = closes.length >= 42
    ? ((latestClose - closes[Math.max(0, closes.length - 42)]) / closes[Math.max(0, closes.length - 42)]) * 100
    : null;
  // ATH ratio: current price vs highest in available klines (proxy)
  const highestClose = Math.max(...closes);
  const athRatio = highestClose > 0 ? latestClose / highestClose : null;
  // Market cap from CoinGecko (will be extracted below)
  // Volume change: current 24h vs previous 24h (from ticker)
  const prevVolume = avgVolume20 > 0 ? avgVolume20 : null;
  const volumeChange24 = prevVolume != null && prevVolume > 0
    ? ((quoteVolume24 - prevVolume * 24) / (prevVolume * 24)) * 100
    : null;

  // Derivatives
  const oi = oiRaw.status === 'fulfilled' && oiRaw.value ? oiRaw.value.value : null;
  const funding = fundingRaw.status === 'fulfilled' && fundingRaw.value ? fundingRaw.value.value : null;
  const fundingAnnualized = funding != null ? funding * 3 * 365 : null; // 8h periods per year
  const predFunding = predFundingRaw.status === 'fulfilled' && predFundingRaw.value ? predFundingRaw.value.value : null;
  const lsRatio = lsRaw.status === 'fulfilled' && lsRaw.value.length > 0
    ? lsRaw.value[lsRaw.value.length - 1].value : null;
  const liqLong = liqRaw.status === 'fulfilled' && liqRaw.value.length > 0
    ? liqRaw.value.reduce((sum, d) => sum + d.long, 0) : 0;
  const liqShort = liqRaw.status === 'fulfilled' && liqRaw.value.length > 0
    ? liqRaw.value.reduce((sum, d) => sum + d.short, 0) : 0;

  // Sentiment / Global / On-chain
  const fngSnapshot = fngRaw.status === 'fulfilled' ? fngRaw.value : null;
  const fng = fngSnapshot?.current ? { value: fngSnapshot.current.value, classification: fngSnapshot.current.classification } : null;

  const cgGlobalRawData = cgGlobalRaw.status === 'fulfilled' ? cgGlobalRaw.value : null;
  const cgGlobal = cgGlobalRawData ? {
    btcDominance: cgGlobalRawData.btcDominance,
    marketCapChange24h: cgGlobalRawData.marketCapChange24hPct,
  } : null;

  const ethOnchain = ethOnchainRaw.status === 'fulfilled' ? ethOnchainRaw.value : null;
  const macro = macroRaw.status === 'fulfilled' ? macroRaw.value : null;
  const oiHist = oiHistRaw.status === 'fulfilled' ? oiHistRaw.value : null;
  const fred = fredRaw.status === 'fulfilled' ? fredRaw.value : null;

  // Social: Santiment primary → LunarCrush fallback
  const santiment = santimentRaw.status === 'fulfilled' ? santimentRaw.value : null;
  const lunarcrush = socialRaw.status === 'fulfilled' ? socialRaw.value : null;
  const social = santiment ?? lunarcrush;
  const socialSource = santiment ? 'SANTIMENT' : (lunarcrush ? 'LUNARCRUSH' : null);

  // On-chain: Coin Metrics primary → CryptoQuant fallback
  const coinMetrics = coinMetricsRaw.status === 'fulfilled' ? coinMetricsRaw.value : null;
  const cqFallback = cqRaw.status === 'fulfilled' ? cqRaw.value : null;
  const cq = (coinMetrics?.onchainMetrics?.mvrv != null) ? coinMetrics : cqFallback;
  const cqSource = (cq === coinMetrics && coinMetrics != null) ? 'COINMETRICS' : (cq != null ? 'CRYPTOQUANT' : null);

  // ═════════════════════════════════════════════════════════════
  // Phase 4: 8-Agent Scoring
  // ═════════════════════════════════════════════════════════════

  // ── STRUCTURE Agent ──
  let structureScore = 0;
  if (sma20 != null) structureScore += latestClose >= sma20 ? 0.26 : -0.26;
  if (sma60 != null) structureScore += latestClose >= sma60 ? 0.2 : -0.2;
  if (sma120 != null) structureScore += latestClose >= sma120 ? 0.14 : -0.14;
  structureScore += change24 >= 0 ? 0.08 : -0.08;
  if (rsi14 != null) {
    if (rsi14 > 64) structureScore += 0.08;
    else if (rsi14 < 36) structureScore -= 0.08;
  }

  // ── FLOW Agent ──
  let flowScore = 0;
  if (change24 > 0) flowScore += 0.12;
  else if (change24 < 0) flowScore -= 0.12;
  if (volumeRatio > 1.35) flowScore += change24 >= 0 ? 0.14 : -0.14;
  else if (volumeRatio < 0.85) flowScore -= 0.06;
  if (quoteVolume24 > 1_000_000_000) flowScore += 0.04;
  else if (quoteVolume24 < 120_000_000) flowScore -= 0.04;
  if (ethOnchain?.exchangeNetflowEth != null) {
    const nfScore = netflowToScore(ethOnchain.exchangeNetflowEth);
    flowScore += (nfScore / 100) * 0.15;
  }
  if (ethOnchain?.whaleActivity != null) {
    const wScore = whaleActivityToScore(ethOnchain.whaleActivity);
    flowScore += (wScore / 100) * 0.15;
  }
  if (ethOnchain?.activeAddresses != null) {
    const aaScore = activeAddressesToScore(ethOnchain.activeAddresses);
    flowScore += (aaScore / 100) * 0.1;
  }
  if (ethOnchain?.exchangeBalance != null) {
    const ebScore = exchangeBalanceToScore(ethOnchain.exchangeBalance);
    flowScore += (ebScore / 100) * 0.15;
  }
  if (cq?.exchangeReserve) {
    const cqResScore = exchangeReserveToScore(cq.exchangeReserve.change7dPct, cq.exchangeReserve.netflow24h);
    flowScore += (cqResScore / 100) * 0.18;
  }
  if (cq?.whaleData?.whaleNetflow != null) {
    const whaleDir = cq.whaleData.whaleNetflow < -500 ? 0.12 : cq.whaleData.whaleNetflow > 500 ? -0.12 : 0;
    flowScore += whaleDir;
  }
  if (cq?.minerData?.minerOutflow24h != null) {
    const mScore = minerFlowToScore(cq.minerData.minerOutflow24h);
    flowScore += (mScore / 100) * 0.1;
  }

  // ── DERIV Agent ──
  let derivScore = 0;
  let derivDataPoints = 0;
  let squeezeDetected = false;
  let oiDivergence = false;

  if (funding != null) {
    derivDataPoints++;
    if (funding > 0.0006) derivScore -= 0.2;
    else if (funding < -0.0006) derivScore += 0.2;
  }
  if (predFunding != null) {
    derivDataPoints++;
    if (predFunding > 0.0006) derivScore -= 0.1;
    else if (predFunding < -0.0006) derivScore += 0.1;
  }
  if (lsRatio != null) {
    derivDataPoints++;
    if (lsRatio > 1.12) derivScore -= 0.14;
    else if (lsRatio < 0.9) derivScore += 0.14;
  }
  if (liqLong > 0 || liqShort > 0) {
    derivDataPoints++;
    const liqBias = (liqShort - liqLong) / Math.max(liqShort + liqLong, 1);
    derivScore += liqBias * 0.18;
  }

  // Squeeze detection
  if (funding != null && lsRatio != null && atrPct != null) {
    const highFunding = Math.abs(funding) > 0.0008;
    const skewedLS = lsRatio > 1.2 || lsRatio < 0.8;
    const lowVol = atrPct < 2.5;
    if (highFunding && skewedLS && lowVol) {
      squeezeDetected = true;
      const squeezeDir = lsRatio > 1 ? 1 : -1;
      derivScore += squeezeDir * 0.15;
      derivDataPoints++;
    }
  }

  // OI divergence detection
  if (oi != null && oiHist != null && Array.isArray(oiHist) && oiHist.length >= 2) {
    const oiFirst = oiHist[0]?.value ?? null;
    const oiLast = oiHist[oiHist.length - 1]?.value ?? null;
    if (oiFirst != null && oiLast != null && oiFirst > 0) {
      const oiChangePct = ((oiLast - oiFirst) / oiFirst) * 100;
      if (change24 > 1 && oiChangePct < -3) {
        oiDivergence = true;
        derivScore -= 0.12;
        derivDataPoints++;
      }
      if (change24 < -1 && oiChangePct > 5) {
        oiDivergence = true;
        derivScore += 0.12;
        derivDataPoints++;
      }
    }
  }

  // ── SENTI Agent ──
  let sentiScore = 0;
  if (fng) {
    const fngScoreVal = fngToScore(fng.value);
    sentiScore += (fngScoreVal / 100) * 0.25;
  } else {
    if (change24 >= 2.0) sentiScore += 0.15;
    else if (change24 <= -2.0) sentiScore -= 0.15;
    else sentiScore += change24 / 20;
  }
  if (social) {
    const lcSentiScore = sentimentToScore(social.sentiment);
    sentiScore += (lcSentiScore / 100) * 0.2;
    const domScore = dominanceToScore(social.socialDominance);
    sentiScore += (domScore / 100) * 0.12;
    const confBoost = galaxyToConfBoost(social.galaxyScore);
    sentiScore += (confBoost / 100) * 0.05;
  }
  if (rsi14 != null) {
    if (rsi14 > 62) sentiScore += 0.1;
    else if (rsi14 < 38) sentiScore -= 0.1;
  }
  if (funding != null) {
    if (funding > 0.0007) sentiScore -= 0.06;
    else if (funding < -0.0007) sentiScore += 0.06;
  }

  // ── MACRO Agent ──
  let macroScore = 0;
  if (macro?.dxy?.changePct != null) {
    const mDxyScore = dxyToScore(macro.dxy.changePct, macro.dxy.trend1m);
    macroScore += (mDxyScore / 100) * 0.2;
  }
  if (macro?.spx?.changePct != null) {
    const spxScore = equityToScore(macro.spx.changePct, macro.spx.trend1m);
    macroScore += (spxScore / 100) * 0.15;
  }
  if (macro?.us10y?.changePct != null) {
    const yScore = yieldToScore(macro.us10y.changePct);
    macroScore += (yScore / 100) * 0.12;
  }
  if (fred?.fedFundsRate?.latest) {
    const ffScore = fedFundsToScore(fred.fedFundsRate.latest.value, fred.fedFundsRate.change);
    macroScore += (ffScore / 100) * 0.15;
  }
  if (fred?.yieldCurve?.latest) {
    const ycScore = yieldCurveToScore(fred.yieldCurve.latest.value);
    macroScore += (ycScore / 100) * 0.12;
  }
  if (fred?.m2?.changePct != null) {
    const m2Score_ = m2ToScore(fred.m2.changePct);
    macroScore += (m2Score_ / 100) * 0.1;
  }
  if (cgGlobal) {
    const domScore = btcDominanceToScore(cgGlobal.btcDominance);
    macroScore += (domScore / 100) * 0.12;
    if (cgGlobal.marketCapChange24h > 2) macroScore += 0.08;
    else if (cgGlobal.marketCapChange24h < -2) macroScore -= 0.08;
    else macroScore += cgGlobal.marketCapChange24h / 35;
  }
  if (sma120 != null) macroScore += latestClose >= sma120 ? 0.1 : -0.1;
  if (Math.abs(change24) > 4) macroScore += change24 > 0 ? 0.06 : -0.06;
  if (funding != null && change24 > 0 && funding > 0.0006) macroScore -= 0.08;
  if (funding != null && change24 < 0 && funding < -0.0006) macroScore += 0.08;

  // ── VPA Agent (Volume Price Analysis) ──
  const recentK20 = klines.slice(-20);
  const cvd = recentK20.reduce((sum, k) => sum + (k.close >= k.open ? k.volume : -k.volume), 0);
  const totalVol20 = recentK20.reduce((sum, k) => sum + k.volume, 0);
  const cvdRatio = totalVol20 > 0 ? cvd / totalVol20 : 0;
  const buyVol = recentK20.filter(k => k.close >= k.open).reduce((s, k) => s + k.volume, 0);
  const sellVol = recentK20.filter(k => k.close < k.open).reduce((s, k) => s + k.volume, 0);
  const bsRatio = (buyVol + sellVol) > 0 ? buyVol / (buyVol + sellVol) : 0.5;
  const last5 = klines.slice(-5);
  let absorptionCount = 0;
  for (const k of last5) {
    const body = Math.abs(k.close - k.open);
    const range = k.high - k.low;
    if (range > 0 && body / range < 0.3 && k.volume > avgVolume20 * 1.2) absorptionCount++;
  }
  let vpaScore = 0;
  vpaScore += cvdRatio * 0.4;
  vpaScore += (bsRatio - 0.5) * 0.6;
  if (absorptionCount >= 2) vpaScore += latestClose < (sma20 ?? latestClose) ? 0.15 : -0.15;

  // ── ICT Agent (Smart Money Concepts) ──
  const high50 = Math.max(...klines.slice(-50).map(k => k.high));
  const low50 = Math.min(...klines.slice(-50).map(k => k.low));
  const range50 = high50 - low50;
  const pricePosition = range50 > 0 ? (latestClose - low50) / range50 : 0.5;
  const recentHigh = Math.max(...klines.slice(-10).map(k => k.high));
  const prevHigh = Math.max(...klines.slice(-20, -10).map(k => k.high));
  const recentLow = Math.min(...klines.slice(-10).map(k => k.low));
  const prevLow = Math.min(...klines.slice(-20, -10).map(k => k.low));
  let bullFVG = 0, bearFVG = 0;
  for (let i = klines.length - 3; i >= Math.max(klines.length - 12, 2); i--) {
    if (klines[i].low > klines[i - 2].high) bullFVG++;
    if (klines[i].high < klines[i - 2].low) bearFVG++;
  }
  let ictScore = 0;
  ictScore += (0.5 - pricePosition) * 0.4;
  if (recentHigh > prevHigh) ictScore += 0.15;
  if (recentLow < prevLow) ictScore -= 0.15;
  ictScore += (bullFVG - bearFVG) * 0.08;
  const last3 = klines.slice(-3);
  for (const k of last3) {
    const body = Math.abs(k.close - k.open);
    const range = k.high - k.low;
    if (range > 0 && body / range > 0.7) ictScore += k.close > k.open ? 0.06 : -0.06;
  }

  // ── VALUATION Agent ──
  let valuationScore = 0;
  if (sma120 != null) {
    const deviation = (latestClose - sma120) / sma120;
    if (deviation > 0.15) valuationScore -= 0.25;
    else if (deviation < -0.15) valuationScore += 0.25;
    else valuationScore += -deviation * 1.2;
  }
  if (rsi14 != null) {
    if (rsi14 > 70) valuationScore -= 0.2;
    else if (rsi14 < 30) valuationScore += 0.2;
    else valuationScore += (50 - rsi14) / 150;
  }
  if (volumeRatio > 1.5 && change24 < -1) valuationScore += 0.12;
  if (volumeRatio > 1.5 && change24 > 3) valuationScore -= 0.12;
  if (cgGlobal) {
    if (cgGlobal.marketCapChange24h < -5) valuationScore += 0.1;
    if (cgGlobal.marketCapChange24h > 5) valuationScore -= 0.1;
  }
  if (ethOnchain?.gas) {
    const gasScore = gasToActivityScore(ethOnchain.gas.standard);
    valuationScore += (gasScore / 100) * 0.12;
  }
  if (cq?.onchainMetrics?.mvrv != null) {
    const mvScore = mvrvToScore(cq.onchainMetrics.mvrv);
    valuationScore += (mvScore / 100) * 0.25;
  }
  if (cq?.onchainMetrics?.nupl != null) {
    const nuplScore_ = nuplToScore(cq.onchainMetrics.nupl);
    valuationScore += (nuplScore_ / 100) * 0.2;
  }

  // ═════════════════════════════════════════════════════════════
  // Phase 5: Signal Assembly
  // ═════════════════════════════════════════════════════════════

  const structureVote = scoreToVote(structureScore, 0.1);
  const flowVote = scoreToVote(flowScore, 0.08);
  const derivVote = derivDataPoints === 0 ? 'neutral' as Vote : scoreToVote(derivScore, 0.1);
  const sentiVote = scoreToVote(sentiScore, 0.08);
  const macroVote = scoreToVote(macroScore, 0.1);
  const vpaVote = scoreToVote(vpaScore, 0.08);
  const ictVote = scoreToVote(ictScore, 0.1);
  const valuationVote = scoreToVote(valuationScore, 0.1);

  const structurePlan = buildTradePlan(latestClose, structureVote, structureScore, atrPct);
  const flowPlan = buildTradePlan(latestClose, flowVote, flowScore, atrPct);
  const derivPlan = buildTradePlan(latestClose, derivVote, derivScore, atrPct);
  const sentiPlan = buildTradePlan(latestClose, sentiVote, sentiScore, atrPct);
  const macroPlan = buildTradePlan(latestClose, macroVote, macroScore, atrPct);
  const vpaPlan = buildTradePlan(latestClose, vpaVote, vpaScore, atrPct);
  const ictPlan = buildTradePlan(latestClose, ictVote, ictScore, atrPct);
  const valuationPlan = buildTradePlan(latestClose, valuationVote, valuationScore, atrPct);

  const signals: AgentSignal[] = [
    {
      id: `structure-${scanRunId}`,
      agentId: 'structure',
      icon: AGENT_META.structure.icon,
      name: AGENT_META.structure.name,
      color: AGENT_META.structure.color,
      token,
      pair: marketPair,
      vote: structureVote,
      conf: scoreToConfidence(structureScore, 60),
      text: `Price ${fmtPrice(latestClose)} · MA20 ${sma20 != null ? fmtPrice(sma20) : '—'} · MA60 ${sma60 != null ? fmtPrice(sma60) : '—'} · RSI ${rsi14 != null ? rsi14.toFixed(1) : '—'} · 24h ${fmtSignedPct(change24)}.`,
      src: `BINANCE:${token}:${tf.toUpperCase()}`,
      time: timeLabel,
      entry: structurePlan.entry,
      tp: structurePlan.tp,
      sl: structurePlan.sl,
    },
    {
      id: `flow-${scanRunId}`,
      agentId: 'flow',
      icon: AGENT_META.flow.icon,
      name: AGENT_META.flow.name,
      color: AGENT_META.flow.color,
      token,
      pair: marketPair,
      vote: flowVote,
      conf: scoreToConfidence(flowScore, 56),
      text: [
        `Vol x${volumeRatio.toFixed(2)} · 24h $${fmtCompact(quoteVolume24)} · ${fmtSignedPct(change24)}`,
        ethOnchain?.exchangeNetflowEth != null ? `Exch ETH ${fmtCompact(ethOnchain.exchangeNetflowEth)}` : null,
        ethOnchain?.whaleActivity != null ? `Whale txs ${ethOnchain.whaleActivity}` : null,
        ethOnchain?.activeAddresses != null ? `Active ${fmtCompact(ethOnchain.activeAddresses)}` : null,
        ethOnchain?.exchangeBalance != null ? `Exch Bal ${fmtCompact(ethOnchain.exchangeBalance)}` : null,
        cq?.exchangeReserve?.change7dPct != null ? `CQ Rsv 7d ${fmtSignedPct(cq.exchangeReserve.change7dPct)}` : null,
        cq?.whaleData?.whaleNetflow != null ? `Whale NF ${fmtCompact(cq.whaleData.whaleNetflow)}` : null,
        cq?.minerData?.minerOutflow24h != null ? `Miner Out ${fmtCompact(cq.minerData.minerOutflow24h)}` : null,
      ].filter(Boolean).join(' · ') + '.',
      src: [
        'BINANCE',
        ethOnchain?.exchangeNetflowEth != null ? 'ETHERSCAN' : null,
        ethOnchain?.whaleActivity != null ? 'DUNE' : null,
        cqSource,
      ].filter(Boolean).join('+'),
      time: timeLabel,
      entry: flowPlan.entry,
      tp: flowPlan.tp,
      sl: flowPlan.sl,
    },
    {
      id: `deriv-${scanRunId}`,
      agentId: 'deriv',
      icon: AGENT_META.deriv.icon,
      name: AGENT_META.deriv.name,
      color: AGENT_META.deriv.color,
      token,
      pair: marketPair,
      vote: derivVote,
      conf: derivDataPoints === 0 ? 48 : scoreToConfidence(derivScore, 58),
      text: derivDataPoints === 0
        ? 'Derivatives API unavailable. Fallback to neutral stance until funding/OI stream recovers.'
        : `OI ${oi != null ? formatOI(oi) : '—'} · Funding ${funding != null ? formatFunding(funding) : '—'} · Pred ${predFunding != null ? formatFunding(predFunding) : '—'} · L/S ${lsRatio != null ? lsRatio.toFixed(2) : '—'} · Liq L ${formatOI(liqLong)} / S ${formatOI(liqShort)}${squeezeDetected ? ' · ⚡SQUEEZE' : ''}${oiDivergence ? ' · ⚠OI-DIV' : ''}.`,
      src: 'COINALYZE:PERP',
      time: timeLabel,
      entry: derivPlan.entry,
      tp: derivPlan.tp,
      sl: derivPlan.sl,
    },
    {
      id: `senti-${scanRunId}`,
      agentId: 'senti',
      icon: AGENT_META.senti.icon,
      name: AGENT_META.senti.name,
      color: AGENT_META.senti.color,
      token,
      pair: marketPair,
      vote: sentiVote,
      conf: scoreToConfidence(sentiScore, social ? 56 : 54) + (social ? Math.min(galaxyToConfBoost(social.galaxyScore), 8) : 0),
      text: [
        fng ? `F&G ${fng.value} ${fng.classification}` : null,
        social ? `Social ${social.sentiment.toFixed(1)}/5 · ${fmtCompact(social.interactions24h)} engagements · Dom ${social.socialDominance.toFixed(2)}% · Galaxy ${social.galaxyScore}` : null,
        `24h ${fmtSignedPct(change24)} · RSI ${rsi14 != null ? rsi14.toFixed(1) : '—'}`,
      ].filter(Boolean).join(' · ') + '.',
      src: [
        fng ? 'F&G' : null,
        socialSource,
        'PROXY',
      ].filter(Boolean).join('+'),
      time: timeLabel,
      entry: sentiPlan.entry,
      tp: sentiPlan.tp,
      sl: sentiPlan.sl,
    },
    {
      id: `macro-${scanRunId}`,
      agentId: 'macro',
      icon: AGENT_META.macro.icon,
      name: AGENT_META.macro.name,
      color: AGENT_META.macro.color,
      token,
      pair: marketPair,
      vote: macroVote,
      conf: scoreToConfidence(macroScore, macro ? 60 : 54),
      text: [
        macro?.dxy ? `DXY ${macro.dxy.price.toFixed(2)} ${fmtSignedPct(macro.dxy.changePct ?? 0)}` : null,
        macro?.spx ? `SPX ${fmtCompact(macro.spx.price)} ${fmtSignedPct(macro.spx.changePct ?? 0)}` : null,
        macro?.us10y ? `US10Y ${macro.us10y.price.toFixed(2)}%` : null,
        fred?.fedFundsRate?.latest ? `FedRate ${fred.fedFundsRate.latest.value.toFixed(2)}%` : null,
        fred?.yieldCurve?.latest ? `YC ${fred.yieldCurve.latest.value > 0 ? '+' : ''}${fred.yieldCurve.latest.value.toFixed(2)}` : null,
        fred?.m2?.changePct != null ? `M2 ${fmtSignedPct(fred.m2.changePct)}` : null,
        cgGlobal ? `BTC Dom ${cgGlobal.btcDominance.toFixed(1)}% · MktCap ${fmtSignedPct(cgGlobal.marketCapChange24h)}` : null,
        `Regime ${sma120 != null ? (latestClose >= sma120 ? 'risk-on' : 'risk-off') : '—'}`,
      ].filter(Boolean).join(' · ') + '.',
      src: [
        macro ? 'YAHOO' : null,
        fred ? 'FRED' : null,
        cgGlobal ? 'COINGECKO' : null,
        'MACRO',
      ].filter(Boolean).join('+'),
      time: timeLabel,
      entry: macroPlan.entry,
      tp: macroPlan.tp,
      sl: macroPlan.sl,
    },
    {
      id: `vpa-${scanRunId}`,
      agentId: 'vpa',
      icon: AGENT_META.vpa.icon,
      name: AGENT_META.vpa.name,
      color: AGENT_META.vpa.color,
      token,
      pair: marketPair,
      vote: vpaVote,
      conf: scoreToConfidence(vpaScore, 56),
      text: `CVD ${cvdRatio > 0 ? 'bullish' : 'bearish'} ${fmtSignedPct(cvdRatio * 100)} · Buy vol ${(bsRatio * 100).toFixed(0)}% · Vol x${volumeRatio.toFixed(2)} · ${absorptionCount >= 2 ? 'Absorption detected' : 'No absorption'}.`,
      src: `BINANCE:${token}:VOLUME`,
      time: timeLabel,
      entry: vpaPlan.entry,
      tp: vpaPlan.tp,
      sl: vpaPlan.sl,
    },
    {
      id: `ict-${scanRunId}`,
      agentId: 'ict',
      icon: AGENT_META.ict.icon,
      name: AGENT_META.ict.name,
      color: AGENT_META.ict.color,
      token,
      pair: marketPair,
      vote: ictVote,
      conf: scoreToConfidence(ictScore, 55),
      text: `${pricePosition > 0.5 ? 'Premium' : 'Discount'} zone ${(pricePosition * 100).toFixed(0)}% · ${recentHigh > prevHigh ? 'Bullish BOS' : recentLow < prevLow ? 'Bearish BOS' : 'No BOS'} · FVG bull ${bullFVG} / bear ${bearFVG} · Range ${fmtPrice(low50)}-${fmtPrice(high50)}.`,
      src: `BINANCE:${token}:ICT`,
      time: timeLabel,
      entry: ictPlan.entry,
      tp: ictPlan.tp,
      sl: ictPlan.sl,
    },
    {
      id: `valuation-${scanRunId}`,
      agentId: 'valuation',
      icon: AGENT_META.valuation.icon,
      name: AGENT_META.valuation.name,
      color: AGENT_META.valuation.color,
      token,
      pair: marketPair,
      vote: valuationVote,
      conf: scoreToConfidence(valuationScore, 54),
      text: [
        sma120 != null ? `MA120 dev ${fmtSignedPct(((latestClose - sma120) / sma120) * 100)}` : 'MA120 —',
        `RSI ${rsi14 != null ? rsi14.toFixed(1) : '—'}`,
        `Vol x${volumeRatio.toFixed(2)}`,
        ethOnchain?.gas ? `Gas ${ethOnchain.gas.standard} Gwei` : null,
        cq?.onchainMetrics?.mvrv != null ? `MVRV ${cq.onchainMetrics.mvrv.toFixed(2)}` : null,
        cq?.onchainMetrics?.nupl != null ? `NUPL ${cq.onchainMetrics.nupl.toFixed(3)}` : null,
        cgGlobal ? `MktCap ${fmtSignedPct(cgGlobal.marketCapChange24h)}` : null,
      ].filter(Boolean).join(' · ') + '.',
      src: [
        ethOnchain?.gas ? 'ETHERSCAN' : null,
        cq?.onchainMetrics ? (cqSource ?? 'ONCHAIN') : null,
        cgGlobal ? 'COINGECKO' : null,
        'VALUATION',
      ].filter(Boolean).join('+'),
      time: timeLabel,
      entry: valuationPlan.entry,
      tp: valuationPlan.tp,
      sl: valuationPlan.sl,
    },
  ];

  // ═════════════════════════════════════════════════════════════
  // Phase 6: Consensus & Summary
  // ═════════════════════════════════════════════════════════════

  const avgConfidence = Math.round(signals.reduce((sum, sig) => sum + sig.conf, 0) / Math.max(signals.length, 1));
  const voteCounts = signals.reduce((acc, sig) => {
    acc[sig.vote] += 1;
    return acc;
  }, { long: 0, short: 0, neutral: 0 });

  const consensus: Vote =
    voteCounts.long > voteCounts.short && voteCounts.long > voteCounts.neutral
      ? 'long'
      : voteCounts.short > voteCounts.long && voteCounts.short > voteCounts.neutral
        ? 'short'
        : 'neutral';

  const summary =
    `Consensus ${consensus.toUpperCase()} · Avg CONF ${avgConfidence}% · ` +
    `RSI ${rsi14 != null ? rsi14.toFixed(1) : '—'} · 24h ${fmtSignedPct(change24)} · Vol x${volumeRatio.toFixed(2)}`;

  const highlights: ScanHighlight[] = signals.map((sig) => ({
    agent: sig.name,
    vote: sig.vote,
    conf: sig.conf,
    note: sig.text,
  }));

  return {
    pair: marketPair,
    timeframe: tf,
    token,
    createdAt: now,
    label: timeLabel,
    signals,
    consensus,
    avgConfidence,
    summary,
    highlights,
  };
}

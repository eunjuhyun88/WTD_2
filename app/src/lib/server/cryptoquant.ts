// ═══════════════════════════════════════════════════════════════
// Stockclaw — CryptoQuant API Client (server-side)
// ═══════════════════════════════════════════════════════════════
// On-chain analytics for FLOW + VALUATION agents
// Exchange reserves, MVRV, NUPL, whale metrics, miner flows

import { env } from '$env/dynamic/private';
import { getCached, setCache } from './providers/cache';

const CQ_BASE = 'https://api.cryptoquant.com/v1';
const CACHE_TTL = 300_000; // 5 min

function apiKey(): string {
  return env.CRYPTOQUANT_API_KEY?.trim() ?? '';
}

export function hasCryptoQuantKey(): boolean {
  return apiKey().length > 0;
}

// ─── Types ────────────────────────────────────────────────────

export interface CQExchangeReserve {
  token: string;
  reserveBtc: number | null;      // BTC on exchanges
  reserveUsd: number | null;      // USD value
  netflow24h: number | null;      // 24h netflow (+ = inflow, - = outflow)
  change7dPct: number | null;     // 7d reserve change %
}

export interface CQOnchainMetrics {
  mvrv: number | null;            // MVRV ratio (>3.5 = overheated, <1 = undervalued)
  nupl: number | null;            // Net Unrealized Profit/Loss (0-1)
  sopr: number | null;            // Spent Output Profit Ratio
  puellMultiple: number | null;   // Puell Multiple (miner revenue ratio)
}

export interface CQWhaleData {
  whaleCount: number | null;      // Active whale addresses
  whaleNetflow: number | null;    // Whale exchange netflow
  exchangeWhaleRatio: number | null; // Whale vs retail exchange ratio
}

export interface CQMinerData {
  minerReserve: number | null;    // BTC in miner wallets
  minerOutflow24h: number | null; // Miner selling pressure
}

export interface CryptoQuantData {
  exchangeReserve: CQExchangeReserve | null;
  onchainMetrics: CQOnchainMetrics | null;
  whaleData: CQWhaleData | null;
  minerData: CQMinerData | null;
  updatedAt: number;
}

// ─── Generic Fetcher ──────────────────────────────────────────

async function cqFetch<T>(path: string): Promise<T | null> {
  const key = apiKey();
  if (!key) return null;

  const cacheKey = `cq:${path}`;
  const cached = getCached<T>(cacheKey);
  if (cached) return cached;

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    try {
      const res = await fetch(`${CQ_BASE}${path}`, {
        headers: {
          'Authorization': `Bearer ${key}`,
          'Accept': 'application/json',
        },
        signal: ctrl.signal,
      });

      if (!res.ok) {
        console.error(`[CryptoQuant] ${path}: ${res.status} ${res.statusText}`);
        return null;
      }

      const json = await res.json();
      const result = json?.result ?? json?.data ?? json;
      setCache(cacheKey, result as T, CACHE_TTL);
      return result as T;
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    console.error(`[CryptoQuant] ${path} error:`, err);
    return null;
  }
}

// ─── Data Fetchers ────────────────────────────────────────────

export async function fetchExchangeReserve(token: 'btc' | 'eth' = 'btc'): Promise<CQExchangeReserve | null> {
  // Try primary path, then fallback
  let data = await cqFetch<any>(`/${token}/exchange-flows/reserve?window=day&limit=2`);
  if (!data) {
    data = await cqFetch<any>(`/${token}/exchange-flows/transactions?window=day&limit=2`);
  }
  if (!data) return null;

  const rows = Array.isArray(data) ? data : data?.data ?? [];
  if (rows.length === 0) return null;

  const latest = rows[0];
  const prev = rows.length > 1 ? rows[1] : null;

  const reserveVal = Number(latest?.reserve_btc ?? latest?.reserve ?? latest?.value);
  const prevReserve = prev ? Number(prev?.reserve_btc ?? prev?.reserve ?? prev?.value) : null;

  return {
    token: token.toUpperCase(),
    reserveBtc: Number.isFinite(reserveVal) ? reserveVal : null,
    reserveUsd: Number.isFinite(Number(latest?.reserve_usd)) ? Number(latest.reserve_usd) : null,
    netflow24h: Number.isFinite(Number(latest?.netflow)) ? Number(latest.netflow) : null,
    change7dPct: prevReserve && prevReserve > 0
      ? Math.round(((reserveVal - prevReserve) / prevReserve) * 10000) / 100
      : null,
  };
}

export async function fetchOnchainMetrics(): Promise<CQOnchainMetrics | null> {
  // CryptoQuant v1 endpoint paths:
  //   MVRV:  /v1/btc/market-data/mvrv
  //   NUPL:  /v1/btc/market-data/nupl
  //   SOPR:  /v1/btc/market-data/sopr
  //   Puell: /v1/btc/mining/puell-multiple
  // All accept ?window=day&limit=1
  const [mvrvData, nuplData, soprData, puellData] = await Promise.allSettled([
    cqFetch<any>('/btc/market-data/mvrv?window=day&limit=1'),
    cqFetch<any>('/btc/market-data/nupl?window=day&limit=1'),
    cqFetch<any>('/btc/market-data/sopr?window=day&limit=1'),
    cqFetch<any>('/btc/mining/puell-multiple?window=day&limit=1'),
  ]);

  function extractFirst(result: PromiseSettledResult<any>): any {
    if (result.status !== 'fulfilled' || !result.value) return null;
    const d = result.value;
    const rows = Array.isArray(d) ? d : d?.data ?? [];
    return rows[0] ?? null;
  }

  const mvrvRow = extractFirst(mvrvData);
  const nuplRow = extractFirst(nuplData);
  const soprRow = extractFirst(soprData);
  const puellRow = extractFirst(puellData);

  const mvrv = mvrvRow ? Number(mvrvRow?.mvrv ?? mvrvRow?.value) : null;
  const nupl = nuplRow ? Number(nuplRow?.nupl ?? nuplRow?.value) : null;
  const sopr = soprRow ? Number(soprRow?.sopr ?? soprRow?.value) : null;
  const puell = puellRow ? Number(puellRow?.puell_multiple ?? puellRow?.value) : null;

  if (mvrv == null && nupl == null && sopr == null && puell == null) return null;

  return {
    mvrv: Number.isFinite(mvrv) ? mvrv : null,
    nupl: Number.isFinite(nupl) ? nupl : null,
    sopr: Number.isFinite(sopr) ? sopr : null,
    puellMultiple: Number.isFinite(puell) ? puell : null,
  };
}

export async function fetchWhaleData(): Promise<CQWhaleData | null> {
  // Try primary path, then fallback
  let data = await cqFetch<any>('/btc/network-data/whale?window=day&limit=1');
  if (!data) {
    data = await cqFetch<any>('/btc/network-data/addresses?window=day&limit=1');
  }
  if (!data) return null;

  const rows = Array.isArray(data) ? data : data?.data ?? [];
  if (rows.length === 0) return null;

  const latest = rows[0];
  return {
    whaleCount: Number.isFinite(Number(latest?.whale_count)) ? Number(latest.whale_count) : null,
    whaleNetflow: Number.isFinite(Number(latest?.whale_netflow)) ? Number(latest.whale_netflow) : null,
    exchangeWhaleRatio: Number.isFinite(Number(latest?.exchange_whale_ratio))
      ? Number(latest.exchange_whale_ratio) : null,
  };
}

export async function fetchMinerData(): Promise<CQMinerData | null> {
  let data = await cqFetch<any>('/btc/miner-flows/reserve?window=day&limit=1');
  if (!data) {
    data = await cqFetch<any>('/btc/mining/miner-reserve?window=day&limit=1');
  }
  if (!data) return null;

  const rows = Array.isArray(data) ? data : data?.data ?? [];
  if (rows.length === 0) return null;

  const latest = rows[0];
  return {
    minerReserve: Number.isFinite(Number(latest?.reserve)) ? Number(latest.reserve) : null,
    minerOutflow24h: Number.isFinite(Number(latest?.outflow)) ? Number(latest.outflow) : null,
  };
}

// ─── Aggregate Fetch ──────────────────────────────────────────

export async function fetchCryptoQuantData(token: 'btc' | 'eth' = 'btc'): Promise<CryptoQuantData> {
  const [reserveRes, metricsRes, whaleRes, minerRes] = await Promise.allSettled([
    fetchExchangeReserve(token),
    fetchOnchainMetrics(),
    fetchWhaleData(),
    fetchMinerData(),
  ]);

  return {
    exchangeReserve: reserveRes.status === 'fulfilled' ? reserveRes.value : null,
    onchainMetrics: metricsRes.status === 'fulfilled' ? metricsRes.value : null,
    whaleData: whaleRes.status === 'fulfilled' ? whaleRes.value : null,
    minerData: minerRes.status === 'fulfilled' ? minerRes.value : null,
    updatedAt: Date.now(),
  };
}

// ─── Scoring Helpers ──────────────────────────────────────────

/**
 * MVRV score: Market Value to Realized Value
 * >3.5 = extremely overvalued (sell), <1 = undervalued (buy)
 * Range: -50 to +50
 */
export function mvrvToScore(mvrv: number): number {
  if (mvrv > 3.5) return -50;     // extreme top
  if (mvrv > 2.5) return -30;     // overheated
  if (mvrv > 1.5) return -10;     // fair-expensive
  if (mvrv > 1.0) return 10;      // fair value
  if (mvrv > 0.8) return 30;      // undervalued
  return 50;                       // deep value zone
}

/**
 * NUPL score: Net Unrealized Profit/Loss
 * >0.75 = euphoria (sell), <0 = capitulation (buy)
 * Range: -40 to +40
 */
export function nuplToScore(nupl: number): number {
  if (nupl > 0.75) return -40;    // greed/euphoria
  if (nupl > 0.5) return -20;     // belief
  if (nupl > 0.25) return 0;      // optimism
  if (nupl > 0) return 15;        // hope
  if (nupl > -0.25) return 30;    // anxiety/capitulation
  return 40;                       // deep capitulation
}

/**
 * Exchange reserve change score.
 * Increasing reserves → sell pressure → bearish
 * Decreasing reserves → accumulation → bullish
 * Range: -35 to +35
 */
export function exchangeReserveToScore(change7dPct: number | null, netflow24h: number | null): number {
  let score = 0;

  // 7-day reserve change
  if (change7dPct != null) {
    if (change7dPct > 3) score -= 25;      // massive inflows
    else if (change7dPct > 1) score -= 15;
    else if (change7dPct < -3) score += 25; // massive outflows
    else if (change7dPct < -1) score += 15;
    else score += Math.round(-change7dPct * 8);
  }

  // 24h netflow direction
  if (netflow24h != null) {
    if (netflow24h > 5000) score -= 10;       // large inflow (BTC)
    else if (netflow24h < -5000) score += 10;  // large outflow
  }

  return Math.round(Math.max(-35, Math.min(35, score)));
}

/**
 * SOPR score: Spent Output Profit Ratio
 * >1.05 = holders in profit selling (bearish pressure)
 * <0.95 = holders selling at loss (capitulation = bullish)
 * Range: -30 to +30
 */
export function soprToScore(sopr: number): number {
  if (sopr > 1.1) return -30;    // heavy profit-taking
  if (sopr > 1.05) return -15;   // moderate profit-taking
  if (sopr > 1.0) return -5;     // slight profit
  if (sopr > 0.95) return 10;    // slight loss (accumulation zone)
  if (sopr > 0.9) return 25;     // capitulation
  return 30;                      // deep capitulation
}

/**
 * Puell Multiple score: daily miner revenue / 365-day MA
 * >4 = miners overpaid (sell), <0.5 = miners underpaid (buy)
 * Range: -30 to +30
 */
export function puellToScore(puell: number): number {
  if (puell > 4.0) return -30;   // extreme top
  if (puell > 2.0) return -15;   // overvalued
  if (puell > 1.0) return 0;     // fair
  if (puell > 0.5) return 15;    // undervalued
  return 30;                      // deep value
}

/**
 * Miner activity score.
 * Miner selling = increased outflow = bearish
 * Miner accumulation = low outflow = bullish
 * Range: -20 to +20
 */
export function minerFlowToScore(outflow24h: number | null): number {
  if (outflow24h == null) return 0;
  // BTC miner daily outflow thresholds
  if (outflow24h > 2000) return -20;   // heavy miner selling
  if (outflow24h > 1000) return -10;
  if (outflow24h < 200) return 15;     // minimal selling
  if (outflow24h < 500) return 5;
  return 0;
}

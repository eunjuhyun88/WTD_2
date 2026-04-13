// ═══════════════════════════════════════════════════════════════
// Coin Metrics Community API Client (server-side)
// ═══════════════════════════════════════════════════════════════
// On-chain analytics for FLOW + VALUATION agents (CryptoQuant 대체)
// Community API — 무료, API 키 불필요
// Provides: MVRV, NUPL (MVRV 기반 근사), Exchange Flows (FlowIn/OutExUSD), Whale Data (GeckoTerminal DEX)

import { getCached, setCache } from './providers/cache';
import type {
  CryptoQuantData,
  CQExchangeReserve,
  CQOnchainMetrics,
} from './cryptoquant';
import { fetchGeckoWhaleData } from './geckoWhale';

const CM_BASE = 'https://community-api.coinmetrics.io/v4';
const CACHE_TTL = 300_000; // 5 min (same as CryptoQuant)

// ── Asset Mapping ────────────────────────────────────────────

const ASSET_MAP: Record<string, string> = {
  btc: 'btc',
  eth: 'eth',
};

// ── Generic Fetcher ──────────────────────────────────────────

async function cmFetch<T>(path: string): Promise<T | null> {
  const cacheKey = `coinmetrics:${path}`;
  const cached = getCached<T>(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetch(`${CM_BASE}${path}`, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      console.error(`[CoinMetrics] ${path}: ${res.status} ${res.statusText}`);
      return null;
    }

    const json = await res.json();
    setCache(cacheKey, json as T, CACHE_TTL);
    return json as T;
  } catch (err) {
    console.error(`[CoinMetrics] ${path} error:`, err instanceof Error ? err.message : err);
    return null;
  }
}

// ── MVRV + NUPL Fetch ────────────────────────────────────────

interface CMTimeseriesResponse {
  data?: Array<{
    asset: string;
    time: string;
    CapMVRVCur?: string;
    CapMrktCurUSD?: string;
    FlowInExUSD?: string;
    FlowOutExUSD?: string;
    [key: string]: string | undefined;
  }>;
}

async function fetchOnchainMetrics(asset: string): Promise<CQOnchainMetrics | null> {
  // Fetch MVRV and market cap from Community API
  // Note: CapRealUSD is Pro-only → NUPL approximated from MVRV: NUPL ≈ 1 - (1/MVRV)
  const metrics = 'CapMVRVCur,CapMrktCurUSD';
  const path = `/timeseries/asset-metrics?assets=${asset}&metrics=${metrics}&frequency=1d&page_size=1&sort=time&paging_from=end`;

  const data = await cmFetch<CMTimeseriesResponse>(path);
  if (!data?.data?.length) return null;

  const row = data.data[0];

  // MVRV: direct from API
  const mvrv = row.CapMVRVCur ? Number(row.CapMVRVCur) : null;

  // NUPL: approximated from MVRV since CapRealUSD is Pro-only
  // Mathematical relationship: MVRV = MarketCap / RealizedCap
  // NUPL = (MarketCap - RealizedCap) / MarketCap = 1 - (1/MVRV)
  let nupl: number | null = null;
  if (mvrv != null && Number.isFinite(mvrv) && mvrv > 0) {
    nupl = 1 - (1 / mvrv);
    // Clamp to reasonable range (-1 to 1)
    nupl = Math.max(-1, Math.min(1, Math.round(nupl * 10000) / 10000));
  }

  if (mvrv == null && nupl == null) return null;

  return {
    mvrv: Number.isFinite(mvrv) ? mvrv : null,
    nupl: Number.isFinite(nupl) ? nupl : null,
    sopr: null,          // Not available in community tier
    puellMultiple: null,  // Not available in community tier
  };
}

// ── Exchange Flow Fetch ──────────────────────────────────────

async function fetchExchangeFlow(asset: string): Promise<CQExchangeReserve | null> {
  // FlowInExUSD = inflow to exchanges, FlowOutExUSD = outflow from exchanges
  // Netflow = Inflow - Outflow (양수 = 거래소 순유입 = 매도 압력 = bearish)
  const metrics = 'FlowInExUSD,FlowOutExUSD';
  const path = `/timeseries/asset-metrics?assets=${asset}&metrics=${metrics}&frequency=1d&page_size=2&sort=time&paging_from=end`;

  const data = await cmFetch<CMTimeseriesResponse>(path);
  if (!data?.data?.length) return null;

  const latest = data.data[0];
  const prev = data.data.length > 1 ? data.data[1] : null;

  const inflow = latest.FlowInExUSD ? Number(latest.FlowInExUSD) : null;
  const outflow = latest.FlowOutExUSD ? Number(latest.FlowOutExUSD) : null;

  if (inflow == null && outflow == null) return null;

  // Netflow24h: inflow - outflow (양수 = 거래소 순유입 = bearish)
  const netflow24h = (inflow != null && outflow != null)
    ? Math.round(inflow - outflow)
    : null;

  // 7d change estimate from 2-day trend
  let change7dPct: number | null = null;
  if (prev) {
    const prevIn = prev.FlowInExUSD ? Number(prev.FlowInExUSD) : null;
    const prevOut = prev.FlowOutExUSD ? Number(prev.FlowOutExUSD) : null;
    if (prevIn != null && prevOut != null && inflow != null && outflow != null) {
      const prevNetflow = prevIn - prevOut;
      const currNetflow = inflow - outflow;
      if (Math.abs(prevNetflow) > 0) {
        const dailyChange = ((currNetflow - prevNetflow) / Math.abs(prevNetflow)) * 100;
        change7dPct = Math.round(dailyChange * 7 * 100) / 100; // extrapolate
      }
    }
  }

  return {
    token: asset.toUpperCase(),
    reserveBtc: null,      // Not directly available
    reserveUsd: null,      // Not directly available
    netflow24h,
    change7dPct,
  };
}

// ── Aggregate Fetch (CryptoQuantData 인터페이스 호환) ─────────

/**
 * Fetch on-chain metrics from Coin Metrics Community API.
 * Returns CryptoQuantData-compatible object for drop-in replacement.
 * API 키 불필요 — Community 엔드포인트.
 */
export async function fetchCoinMetricsData(token: 'btc' | 'eth' = 'btc'): Promise<CryptoQuantData> {
  const asset = ASSET_MAP[token] ?? token;

  const [metricsRes, flowRes, whaleRes] = await Promise.allSettled([
    fetchOnchainMetrics(asset),
    fetchExchangeFlow(asset),
    fetchGeckoWhaleData(token),  // GeckoTerminal DEX 고래 추적 (무료)
  ]);

  return {
    exchangeReserve: flowRes.status === 'fulfilled' ? flowRes.value : null,
    onchainMetrics: metricsRes.status === 'fulfilled' ? metricsRes.value : null,
    whaleData: whaleRes.status === 'fulfilled' ? whaleRes.value : null,  // GeckoTerminal DEX whales
    minerData: null,    // Not available in community tier (already null-safe in consumers)
    updatedAt: Date.now(),
  };
}

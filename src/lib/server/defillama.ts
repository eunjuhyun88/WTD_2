// ═══════════════════════════════════════════════════════════════
// Stockclaw — DeFiLlama server client
// ═══════════════════════════════════════════════════════════════

import { getCached, setCache } from './providers/cache';

const STABLE_BASE = 'https://stablecoins.llama.fi';
const CACHE_TTL = 5 * 60_000; // 5분 (일간 데이터)

export type DeFiLlamaStableMcap = {
  totalMcapUsd: number;
  change24hPct: number;
  change7dPct: number;
  updatedAt: number;
};

async function fetchJson(path: string, timeoutMs = 8000): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${STABLE_BASE}${path}`, {
      signal: ctrl.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`defillama ${res.status}`);
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

function parseTotalMcap(row: any): number {
  return Number(row?.totalCirculatingUSD?.peggedUSD ?? 0);
}

export async function fetchDefiLlamaStableMcap(): Promise<DeFiLlamaStableMcap | null> {
  const cacheKey = 'defillama:stableMcap';
  const cached = getCached<DeFiLlamaStableMcap>(cacheKey);
  if (cached) return cached;

  try {
    const chart = await fetchJson('/stablecoincharts/all?stablecoin=1');
    if (!Array.isArray(chart) || chart.length < 2) return null;

    const latest = chart[chart.length - 1];
    const prev1d = chart[chart.length - 2];
    const prev7d = chart[Math.max(0, chart.length - 8)];

    const latestMcap = parseTotalMcap(latest);
    const prev1dMcap = parseTotalMcap(prev1d);
    const prev7dMcap = parseTotalMcap(prev7d);

    const change24hPct = prev1dMcap > 0 ? ((latestMcap - prev1dMcap) / prev1dMcap) * 100 : 0;
    const change7dPct = prev7dMcap > 0 ? ((latestMcap - prev7dMcap) / prev7dMcap) * 100 : 0;

    const dateMs =
      Number(latest?.date) > 0
        ? Number(latest.date) * 1000
        : Number.isFinite(Date.parse(String(latest?.date))) ? Date.parse(String(latest.date)) : Date.now();

    const result: DeFiLlamaStableMcap = {
      totalMcapUsd: latestMcap,
      change24hPct,
      change7dPct,
      updatedAt: Number.isFinite(dateMs) ? dateMs : Date.now(),
    };
    setCache(cacheKey, result, CACHE_TTL);
    return result;
  } catch (error) {
    console.error('[defillama/stablecoin] fetch failed:', error);
    return null;
  }
}

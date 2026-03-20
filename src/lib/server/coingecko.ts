// ═══════════════════════════════════════════════════════════════
// Stockclaw — CoinGecko server client
// ═══════════════════════════════════════════════════════════════

import { getCached, setCache } from './providers/cache';

const CG_BASE = 'https://api.coingecko.com/api/v3';
const STABLE_IDS = ['tether', 'usd-coin', 'dai', 'ethena-usde', 'first-digital-usd'];
const CACHE_TTL = 3 * 60_000; // 3분

export type CoinGeckoGlobal = {
  totalMarketCapUsd: number;
  totalVolumeUsd: number;
  btcDominance: number;
  ethDominance: number;
  marketCapChange24hPct: number;
  activeCryptocurrencies: number;
  updatedAt: number;
};

export type StablecoinMcap = {
  totalMcapUsd: number;
  change24hPct: number;
  top: Array<{
    id: string;
    symbol: string;
    marketCapUsd: number;
  }>;
  updatedAt: number;
};

async function fetchJson(path: string, params: Record<string, string>, timeoutMs = 8000): Promise<any> {
  const qs = new URLSearchParams(params);
  const url = `${CG_BASE}${path}?${qs.toString()}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`coingecko ${res.status}`);
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchCoinGeckoGlobal(): Promise<CoinGeckoGlobal | null> {
  const cacheKey = 'coingecko:global';
  const cached = getCached<CoinGeckoGlobal>(cacheKey);
  if (cached) return cached;

  try {
    const payload = await fetchJson('/global', {});
    const data = payload?.data;
    if (!data) return null;

    const updatedSec = Number(data.updated_at);
    const result: CoinGeckoGlobal = {
      totalMarketCapUsd: Number(data.total_market_cap?.usd ?? 0),
      totalVolumeUsd: Number(data.total_volume?.usd ?? 0),
      btcDominance: Number(data.market_cap_percentage?.btc ?? 0),
      ethDominance: Number(data.market_cap_percentage?.eth ?? 0),
      marketCapChange24hPct: Number(data.market_cap_change_percentage_24h_usd ?? 0),
      activeCryptocurrencies: Number(data.active_cryptocurrencies ?? 0),
      updatedAt: Number.isFinite(updatedSec) ? updatedSec * 1000 : Date.now(),
    };
    setCache(cacheKey, result, CACHE_TTL);
    return result;
  } catch (error) {
    console.error('[coingecko/global] fetch failed:', error);
    return null;
  }
}

export async function fetchStablecoinMcap(): Promise<StablecoinMcap | null> {
  const cacheKey = 'coingecko:stableMcap';
  const cached = getCached<StablecoinMcap>(cacheKey);
  if (cached) return cached;

  try {
    const payload = await fetchJson('/coins/markets', {
      vs_currency: 'usd',
      ids: STABLE_IDS.join(','),
      order: 'market_cap_desc',
      per_page: '20',
      page: '1',
      sparkline: 'false',
    });
    if (!Array.isArray(payload) || payload.length === 0) return null;

    const top = payload.map((row: any) => ({
      id: String(row?.id ?? ''),
      symbol: String(row?.symbol ?? '').toUpperCase(),
      marketCapUsd: Number(row?.market_cap ?? 0),
    }));
    const totalMcapUsd = top.reduce((sum, row) => sum + row.marketCapUsd, 0);
    const change24hPct =
      payload.reduce((sum: number, row: any) => sum + Number(row?.market_cap_change_percentage_24h ?? 0), 0) /
      payload.length;

    const result: StablecoinMcap = {
      totalMcapUsd,
      change24hPct: Number.isFinite(change24hPct) ? change24hPct : 0,
      top,
      updatedAt: Date.now(),
    };
    setCache(cacheKey, result, CACHE_TTL);
    return result;
  } catch (error) {
    console.error('[coingecko/stablecoins] fetch failed:', error);
    return null;
  }
}

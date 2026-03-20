// ═══════════════════════════════════════════════════════════════
// Stockclaw — CoinMarketCap server client
// ═══════════════════════════════════════════════════════════════
// Quotes + Trending (Gainers/Losers, Most Visited, Latest)

import { env } from '$env/dynamic/private';
import { getCached, setCache } from './providers/cache';

const CMC_BASE = 'https://pro-api.coinmarketcap.com';
const CACHE_TTL = 120_000; // 2 min

function apiKey(): string {
  return env.COINMARKETCAP_API_KEY?.trim() ?? '';
}

export function hasCoinMarketCapApiKey(): boolean {
  return apiKey().length > 0;
}

// ─── Types ────────────────────────────────────────────────────

export type CoinMarketCapQuote = {
  symbol: string;
  price: number;
  marketCap: number;
  volume24h: number;
  change24hPct: number;
  updatedAt: number;
};

export type CMCTrendingCoin = {
  id: number;
  name: string;
  symbol: string;
  slug: string;
  rank: number;
  price: number;
  change1h: number;
  change24h: number;
  change7d: number;
  marketCap: number;
  volume24h: number;
};

export type CMCGainerLoser = CMCTrendingCoin & {
  direction: 'gainer' | 'loser';
};

// ─── Generic Fetcher ──────────────────────────────────────────

async function cmcFetch<T>(path: string, params: Record<string, string> = {}): Promise<T | null> {
  const key = apiKey();
  if (!key) return null;

  const cacheKey = `cmc:${path}:${JSON.stringify(params)}`;
  const cached = getCached<T>(cacheKey);
  if (cached) return cached;

  try {
    const qs = new URLSearchParams(params);
    const url = `${CMC_BASE}${path}${qs.toString() ? '?' + qs.toString() : ''}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'X-CMC_PRO_API_KEY': key,
        },
        signal: ctrl.signal,
      });

      if (!res.ok) {
        console.error(`[CMC] ${path}: ${res.status}`);
        return null;
      }

      const json = await res.json();
      const result = (json?.data ?? json) as T;
      setCache(cacheKey, result, CACHE_TTL);
      return result;
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    console.error(`[CMC] ${path} error:`, err);
    return null;
  }
}

// ─── Helper: Parse coin from CMC response ─────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseCMCCoin(raw: any, rank?: number): CMCTrendingCoin | null {
  if (!raw) return null;
  const usd = raw?.quote?.USD;
  if (!usd) return null;
  return {
    id: Number(raw.id ?? 0),
    name: String(raw.name ?? ''),
    symbol: String(raw.symbol ?? '').toUpperCase(),
    slug: String(raw.slug ?? ''),
    rank: rank ?? Number(raw.cmc_rank ?? raw.rank ?? 0),
    price: Number(usd.price ?? 0),
    change1h: Number(usd.percent_change_1h ?? 0),
    change24h: Number(usd.percent_change_24h ?? 0),
    change7d: Number(usd.percent_change_7d ?? 0),
    marketCap: Number(usd.market_cap ?? 0),
    volume24h: Number(usd.volume_24h ?? 0),
  };
}

// ─── Quote ────────────────────────────────────────────────────

export async function fetchCoinMarketCapQuote(symbol: string): Promise<CoinMarketCapQuote | null> {
  const normalizedSymbol = symbol.trim().toUpperCase();
  if (!normalizedSymbol) return null;

  const data = await cmcFetch<any>('/v1/cryptocurrency/quotes/latest', {
    symbol: normalizedSymbol,
    convert: 'USD',
  });
  if (!data) return null;

  const asset = data[normalizedSymbol];
  const usd = asset?.quote?.USD;
  if (!usd) return null;

  return {
    symbol: normalizedSymbol,
    price: Number(usd.price ?? 0),
    marketCap: Number(usd.market_cap ?? 0),
    volume24h: Number(usd.volume_24h ?? 0),
    change24hPct: Number(usd.percent_change_24h ?? 0),
    updatedAt: Date.now(),
  };
}

// ─── Trending / Most Visited ──────────────────────────────────

/**
 * Fetch trending cryptocurrencies (most searched/visited on CMC).
 * Endpoint: /v1/cryptocurrency/trending/latest
 * Requires Hobbyist+ plan. Falls back to listings if unavailable.
 */
export async function fetchCMCTrending(limit = 20): Promise<CMCTrendingCoin[]> {
  // Try trending endpoint first (requires paid plan)
  const trending = await cmcFetch<any[]>('/v1/cryptocurrency/trending/latest', {
    limit: String(limit),
    convert: 'USD',
  });

  if (Array.isArray(trending) && trending.length > 0) {
    return trending
      .map((raw, i) => parseCMCCoin(raw, i + 1))
      .filter((c): c is CMCTrendingCoin => c !== null);
  }

  // Fallback: top coins by 24h volume change (Basic plan)
  const listings = await cmcFetch<any[]>('/v1/cryptocurrency/listings/latest', {
    limit: String(limit),
    sort: 'volume_24h',
    sort_dir: 'desc',
    convert: 'USD',
  });

  if (!Array.isArray(listings)) return [];
  return listings
    .map((raw, i) => parseCMCCoin(raw, i + 1))
    .filter((c): c is CMCTrendingCoin => c !== null);
}

/**
 * Fetch biggest gainers and losers.
 * Endpoint: /v1/cryptocurrency/trending/gainers-losers
 * Falls back to listings sorted by % change.
 */
export async function fetchCMCGainersLosers(limit = 10): Promise<{
  gainers: CMCGainerLoser[];
  losers: CMCGainerLoser[];
}> {
  // Try gainers-losers endpoint first
  const data = await cmcFetch<any>('/v1/cryptocurrency/trending/gainers-losers', {
    limit: String(limit),
    time_period: '24h',
    convert: 'USD',
  });

  if (data) {
    const gainersRaw = Array.isArray(data.gainers) ? data.gainers : [];
    const losersRaw = Array.isArray(data.losers) ? data.losers : [];

    return {
      gainers: gainersRaw
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((r: any, i: number) => ({ ...parseCMCCoin(r, i + 1), direction: 'gainer' as const }))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((c: any): c is CMCGainerLoser => c !== null && c.symbol),
      losers: losersRaw
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((r: any, i: number) => ({ ...parseCMCCoin(r, i + 1), direction: 'loser' as const }))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((c: any): c is CMCGainerLoser => c !== null && c.symbol),
    };
  }

  // Fallback: use listings sorted by percent_change_24h
  const [gainersData, losersData] = await Promise.allSettled([
    cmcFetch<any[]>('/v1/cryptocurrency/listings/latest', {
      limit: String(limit),
      sort: 'percent_change_24h',
      sort_dir: 'desc',
      convert: 'USD',
    }),
    cmcFetch<any[]>('/v1/cryptocurrency/listings/latest', {
      limit: String(limit),
      sort: 'percent_change_24h',
      sort_dir: 'asc',
      convert: 'USD',
    }),
  ]);

  const parseList = (res: PromiseSettledResult<any[] | null>, dir: 'gainer' | 'loser'): CMCGainerLoser[] => {
    if (res.status !== 'fulfilled' || !Array.isArray(res.value)) return [];
    return res.value
      .map((r, i) => {
        const coin = parseCMCCoin(r, i + 1);
        return coin ? { ...coin, direction: dir } : null;
      })
      .filter((c): c is CMCGainerLoser => c !== null);
  };

  return {
    gainers: parseList(gainersData, 'gainer'),
    losers: parseList(losersData, 'loser'),
  };
}

/**
 * Fetch most-visited coins on CMC (proxy for search interest).
 * Endpoint: /v1/cryptocurrency/trending/most-visited
 */
export async function fetchCMCMostVisited(limit = 20): Promise<CMCTrendingCoin[]> {
  const data = await cmcFetch<any[]>('/v1/cryptocurrency/trending/most-visited', {
    limit: String(limit),
    convert: 'USD',
  });

  if (!Array.isArray(data)) return [];
  return data
    .map((raw, i) => parseCMCCoin(raw, i + 1))
    .filter((c): c is CMCTrendingCoin => c !== null);
}


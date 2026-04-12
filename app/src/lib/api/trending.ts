// ═══════════════════════════════════════════════════════════════
// STOCKCLAW — Trending Client (client-side)
// ═══════════════════════════════════════════════════════════════
// Unified trending data: CMC + LunarCrush + DexScreener

export interface TrendingCoin {
  rank: number;
  symbol: string;
  name: string;
  slug: string;
  price: number;
  change1h: number;
  change24h: number;
  change7d: number;
  marketCap: number;
  volume24h: number;
  sentiment?: number | null;
  socialVolume?: number | null;
  galaxyScore?: number | null;
}

export interface GainerLoser extends TrendingCoin {
  direction: 'gainer' | 'loser';
}

export interface DexTrendingToken {
  chainId: string;
  tokenAddress: string;
  url: string;
  description: string | null;
  icon: string | null;
}

export interface TrendingData {
  trending: TrendingCoin[];
  gainers: GainerLoser[];
  losers: GainerLoser[];
  mostVisited: TrendingCoin[];
  dexHot: DexTrendingToken[];
  updatedAt: number;
}

/**
 * Fetch unified trending data from our API.
 * @param section - 'all' | 'trending' | 'gainers' | 'dex' (default: 'all')
 * @param limit - Number of items per section (default: 20, max: 50)
 */
export async function fetchTrending(
  section: 'all' | 'trending' | 'gainers' | 'dex' = 'all',
  limit = 20,
): Promise<TrendingData | null> {
  try {
    const params = new URLSearchParams({ section, limit: String(limit) });
    const res = await fetch(`/api/market/trending?${params}`, {
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.data ?? null;
  } catch (err) {
    console.error('[Trending] fetch error:', err);
    return null;
  }
}

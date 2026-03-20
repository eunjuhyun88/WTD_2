// ═══════════════════════════════════════════════════════════════
// STOCKCLAW — CoinGecko API Client (B-05)
// ═══════════════════════════════════════════════════════════════
// Free tier: 50 calls/min, no key required
// https://www.coingecko.com/en/api/documentation
//
// Maps to: MACRO agent → BTC_DOMINANCE, STABLECOIN_MCAP
//          General market context

const CG_BASE = 'https://api.coingecko.com/api/v3';

// ─── Types ─────────────────────────────────────────────────

export interface CoinGeckoGlobal {
  totalMarketCap: number;
  totalVolume: number;
  btcDominance: number;
  ethDominance: number;
  marketCapChange24h: number;
  activeCryptocurrencies: number;
  updatedAt: number;
}

export interface CoinGeckoMarket {
  id: string;
  symbol: string;
  name: string;
  currentPrice: number;
  marketCap: number;
  totalVolume: number;
  priceChange24h: number;
  priceChangePercent24h: number;
  ath: number;
  athChangePercent: number;
}

export interface StablecoinMcap {
  totalMcap: number;
  change24h: number;
  topStables: { id: string; symbol: string; mcap: number }[];
}

// ─── Helpers ─────────────────────────────────────────────────

async function cgFetch(path: string, params: Record<string, string> = {}): Promise<any> {
  const qs = new URLSearchParams(params);
  const url = `${CG_BASE}${path}?${qs}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// ─── Global Market Data ──────────────────────────────────────

export async function fetchGlobal(): Promise<CoinGeckoGlobal | null> {
  try {
    const json = await cgFetch('/global');
    const d = json?.data;
    if (!d) return null;
    return {
      totalMarketCap: d.total_market_cap?.usd ?? 0,
      totalVolume: d.total_volume?.usd ?? 0,
      btcDominance: d.market_cap_percentage?.btc ?? 0,
      ethDominance: d.market_cap_percentage?.eth ?? 0,
      marketCapChange24h: d.market_cap_change_percentage_24h_usd ?? 0,
      activeCryptocurrencies: d.active_cryptocurrencies ?? 0,
      updatedAt: (d.updated_at ?? Math.floor(Date.now() / 1000)) * 1000,
    };
  } catch (err) {
    console.error('[CoinGecko] global error:', err);
    return null;
  }
}

// ─── Market Data (top coins) ─────────────────────────────────

export async function fetchMarkets(limit = 20): Promise<CoinGeckoMarket[]> {
  try {
    const json = await cgFetch('/coins/markets', {
      vs_currency: 'usd',
      order: 'market_cap_desc',
      per_page: String(limit),
      page: '1',
      sparkline: 'false',
    });
    if (!Array.isArray(json)) return [];

    return json.map((c: any) => ({
      id: c.id,
      symbol: c.symbol,
      name: c.name,
      currentPrice: c.current_price ?? 0,
      marketCap: c.market_cap ?? 0,
      totalVolume: c.total_volume ?? 0,
      priceChange24h: c.price_change_24h ?? 0,
      priceChangePercent24h: c.price_change_percentage_24h ?? 0,
      ath: c.ath ?? 0,
      athChangePercent: c.ath_change_percentage ?? 0,
    }));
  } catch (err) {
    console.error('[CoinGecko] markets error:', err);
    return [];
  }
}

// ─── Stablecoin Market Cap ───────────────────────────────────

const STABLECOIN_IDS = ['tether', 'usd-coin', 'dai', 'first-digital-usd', 'ethena-usde'];

export async function fetchStablecoinMcap(): Promise<StablecoinMcap | null> {
  try {
    const json = await cgFetch('/coins/markets', {
      vs_currency: 'usd',
      ids: STABLECOIN_IDS.join(','),
      order: 'market_cap_desc',
      per_page: '10',
      page: '1',
      sparkline: 'false',
    });
    if (!Array.isArray(json) || json.length === 0) return null;

    const topStables = json.map((c: any) => ({
      id: c.id,
      symbol: c.symbol?.toUpperCase() ?? '',
      mcap: c.market_cap ?? 0,
    }));

    const totalMcap = topStables.reduce((s: number, c: { mcap: number }) => s + c.mcap, 0);
    const totalChange = json.reduce(
      (s: number, c: any) => s + (c.market_cap_change_percentage_24h ?? 0),
      0
    ) / json.length;

    return { totalMcap, change24h: totalChange, topStables };
  } catch (err) {
    console.error('[CoinGecko] stablecoin mcap error:', err);
    return null;
  }
}

// ─── BTC Dominance Score (for MACRO factor) ──────────────────

/**
 * Convert BTC dominance to a factor score.
 * High dominance (>60%) → bearish for alts, bullish safety → +30
 * Low dominance (<40%) → alt season signal → -30
 * Range: -50 to +50
 */
export function btcDominanceToScore(btcDom: number): number {
  // Center at 50%, scale linearly
  return Math.round((btcDom - 50) * 2.5);
}

// ═══════════════════════════════════════════════════════════════
// STOCKCLAW — Polymarket API Client
// Fetches from local proxy to avoid CORS
// ═══════════════════════════════════════════════════════════════

export interface PolyMarket {
  id: string;
  question: string;
  slug: string;
  category: string;
  endDate: string;
  volume: number;
  liquidity: number;
  active: boolean;
  closed: boolean;
  outcomes: string[];
  outcomePrices: string[];
  image?: string;
  icon?: string;
}

export interface PolyOrderBook {
  market: string;
  asset_id: string;
  bids: Array<{ price: string; size: string }>;
  asks: Array<{ price: string; size: string }>;
}

/**
 * Fetch active crypto-related markets from Polymarket
 */
export async function fetchPolymarkets(limit = 20): Promise<PolyMarket[]> {
  try {
    const res = await fetch(`/api/polymarket/markets?limit=${limit}`, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.markets || [];
  } catch (err) {
    console.error('[Polymarket] Failed to fetch markets:', err);
    return [];
  }
}

/**
 * Fetch orderbook for a specific market
 */
export async function fetchOrderbook(tokenId: string): Promise<PolyOrderBook | null> {
  try {
    const res = await fetch(`/api/polymarket/orderbook?token_id=${tokenId}`, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error('[Polymarket] Failed to fetch orderbook:', err);
    return null;
  }
}

/**
 * Parse outcome prices from Polymarket format
 */
export function parseOutcomePrices(prices: string[]): { yes: number; no: number } {
  try {
    const parsed = prices.map(p => parseFloat(p));
    return { yes: parsed[0] || 0.5, no: parsed[1] || 0.5 };
  } catch {
    return { yes: 0.5, no: 0.5 };
  }
}

/**
 * Format volume for display
 */
export function formatVolume(vol: number): string {
  if (vol >= 1_000_000) return `$${(vol / 1_000_000).toFixed(1)}M`;
  if (vol >= 1_000) return `$${(vol / 1_000).toFixed(1)}K`;
  return `$${vol.toFixed(0)}`;
}

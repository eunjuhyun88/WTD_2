// ═══════════════════════════════════════════════════════════════
// STOCKCLAW — CoinCap API Client (B-05)
// ═══════════════════════════════════════════════════════════════
// Completely free, no key, no hard rate limit
// https://docs.coincap.io/
//
// Maps to: backup price data + MACRO metrics

const CC_BASE = 'https://api.coincap.io/v2';

// ─── Types ─────────────────────────────────────────────────

export interface CoinCapAsset {
  id: string;
  symbol: string;
  name: string;
  priceUsd: number;
  marketCapUsd: number;
  volumeUsd24Hr: number;
  changePercent24Hr: number;
  supply: number;
  maxSupply: number | null;
}

export interface CoinCapHistory {
  time: number;   // unix ms
  priceUsd: number;
}

// ─── Helpers ─────────────────────────────────────────────────

async function ccFetch(path: string, params: Record<string, string> = {}): Promise<any> {
  const qs = new URLSearchParams(params);
  const sep = qs.toString() ? '?' : '';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(`${CC_BASE}${path}${sep}${qs}`, { signal: controller.signal });
    if (!res.ok) throw new Error(`CoinCap ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// ─── Asset Data ─────────────────────────────────────────────

export async function fetchAsset(id: string): Promise<CoinCapAsset | null> {
  try {
    const json = await ccFetch(`/assets/${id}`);
    const d = json?.data;
    if (!d) return null;
    return {
      id: d.id,
      symbol: d.symbol,
      name: d.name,
      priceUsd: parseFloat(d.priceUsd) || 0,
      marketCapUsd: parseFloat(d.marketCapUsd) || 0,
      volumeUsd24Hr: parseFloat(d.volumeUsd24Hr) || 0,
      changePercent24Hr: parseFloat(d.changePercent24Hr) || 0,
      supply: parseFloat(d.supply) || 0,
      maxSupply: d.maxSupply ? parseFloat(d.maxSupply) : null,
    };
  } catch (err) {
    console.error('[CoinCap] asset error:', err);
    return null;
  }
}

/** Fetch top assets by market cap */
export async function fetchTopAssets(limit = 20): Promise<CoinCapAsset[]> {
  try {
    const json = await ccFetch('/assets', { limit: String(limit) });
    if (!json?.data || !Array.isArray(json.data)) return [];
    return json.data.map((d: any) => ({
      id: d.id,
      symbol: d.symbol,
      name: d.name,
      priceUsd: parseFloat(d.priceUsd) || 0,
      marketCapUsd: parseFloat(d.marketCapUsd) || 0,
      volumeUsd24Hr: parseFloat(d.volumeUsd24Hr) || 0,
      changePercent24Hr: parseFloat(d.changePercent24Hr) || 0,
      supply: parseFloat(d.supply) || 0,
      maxSupply: d.maxSupply ? parseFloat(d.maxSupply) : null,
    }));
  } catch (err) {
    console.error('[CoinCap] topAssets error:', err);
    return [];
  }
}

/** Fetch price history */
export async function fetchHistory(
  id: string,
  interval: 'h1' | 'h2' | 'h6' | 'h12' | 'd1' = 'd1',
  start?: number,
  end?: number
): Promise<CoinCapHistory[]> {
  try {
    const params: Record<string, string> = { interval };
    if (start) params.start = String(start);
    if (end) params.end = String(end);

    const json = await ccFetch(`/assets/${id}/history`, params);
    if (!json?.data || !Array.isArray(json.data)) return [];
    return json.data.map((d: any) => ({
      time: d.time,
      priceUsd: parseFloat(d.priceUsd) || 0,
    }));
  } catch (err) {
    console.error('[CoinCap] history error:', err);
    return [];
  }
}

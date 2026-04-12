// ═══════════════════════════════════════════════════════════════
// STOCKCLAW — Portfolio API Client
// ═══════════════════════════════════════════════════════════════

export interface PortfolioHolding {
  id: string;
  symbol: string;
  name: string;
  amount: number;
  avgPrice: number;
  currentPrice: number;
  source: string;
  updatedAt: number;
}

export interface PortfolioResponse {
  ok: boolean;
  data: {
    holdings: PortfolioHolding[];
    totalValue: number;
    totalCost: number;
  };
}

function canFetch(): boolean {
  return typeof window !== 'undefined' && typeof fetch === 'function';
}

export async function fetchHoldings(): Promise<PortfolioResponse | null> {
  if (!canFetch()) return null;
  try {
    const res = await fetch('/api/portfolio/holdings', { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function upsertHolding(data: {
  symbol: string;
  name: string;
  amount: number;
  avgPrice: number;
  currentPrice?: number;
  source?: string;
}): Promise<boolean> {
  if (!canFetch()) return false;
  try {
    const res = await fetch('/api/portfolio/holdings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify(data),
    });
    return res.ok;
  } catch {
    return false;
  }
}

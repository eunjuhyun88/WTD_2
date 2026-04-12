// ═══════════════════════════════════════════════════════════════
// STOCKCLAW — CryptoQuant Client (client-side)
// ═══════════════════════════════════════════════════════════════
// Wraps /api/onchain/cryptoquant proxy for FLOW + VALUATION agents

export interface CQExchangeReserve {
  token: string;
  reserveBtc: number | null;
  reserveUsd: number | null;
  netflow24h: number | null;
  change7dPct: number | null;
}

export interface CQOnchainMetrics {
  mvrv: number | null;
  nupl: number | null;
  sopr: number | null;
  puellMultiple: number | null;
}

export interface CQWhaleData {
  whaleCount: number | null;
  whaleNetflow: number | null;
  exchangeWhaleRatio: number | null;
}

export interface CQMinerData {
  minerReserve: number | null;
  minerOutflow24h: number | null;
}

export interface CryptoQuantData {
  exchangeReserve: CQExchangeReserve | null;
  onchainMetrics: CQOnchainMetrics | null;
  whaleData: CQWhaleData | null;
  minerData: CQMinerData | null;
  updatedAt: number;
}

/** Fetch CryptoQuant on-chain data from our proxy */
export async function fetchCryptoQuantData(token: 'btc' | 'eth' = 'btc'): Promise<CryptoQuantData | null> {
  try {
    const res = await fetch(`/api/onchain/cryptoquant?token=${token}`, {
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.data ?? null;
  } catch (err) {
    console.error('[CryptoQuant] fetch error:', err);
    return null;
  }
}

// ─── Scoring Helpers (FLOW + VALUATION agents) ────────────────

/**
 * MVRV score: Market Value to Realized Value
 * >3.5 = extreme top → sell. <1 = undervalued → buy.
 * Range: -50 to +50
 */
export function mvrvToScore(mvrv: number): number {
  if (mvrv > 3.5) return -50;
  if (mvrv > 2.5) return -30;
  if (mvrv > 1.5) return -10;
  if (mvrv > 1.0) return 10;
  if (mvrv > 0.8) return 30;
  return 50;
}

/**
 * NUPL score: Net Unrealized Profit/Loss
 * >0.75 = euphoria → sell. <0 = capitulation → buy.
 * Range: -40 to +40
 */
export function nuplToScore(nupl: number): number {
  if (nupl > 0.75) return -40;
  if (nupl > 0.5) return -20;
  if (nupl > 0.25) return 0;
  if (nupl > 0) return 15;
  if (nupl > -0.25) return 30;
  return 40;
}

/**
 * Exchange reserve change score.
 * Increasing reserves → sell pressure → bearish.
 * Decreasing reserves → accumulation → bullish.
 * Range: -35 to +35
 */
export function exchangeReserveToScore(change7dPct: number | null, netflow24h: number | null): number {
  let score = 0;
  if (change7dPct != null) {
    if (change7dPct > 3) score -= 25;
    else if (change7dPct > 1) score -= 15;
    else if (change7dPct < -3) score += 25;
    else if (change7dPct < -1) score += 15;
    else score += Math.round(-change7dPct * 8);
  }
  if (netflow24h != null) {
    if (netflow24h > 5000) score -= 10;
    else if (netflow24h < -5000) score += 10;
  }
  return Math.round(Math.max(-35, Math.min(35, score)));
}

/**
 * Miner activity score.
 * Heavy miner selling = bearish, miner accumulation = bullish.
 * Range: -20 to +20
 */
export function minerFlowToScore(outflow24h: number | null): number {
  if (outflow24h == null) return 0;
  if (outflow24h > 2000) return -20;
  if (outflow24h > 1000) return -10;
  if (outflow24h < 200) return 15;
  if (outflow24h < 500) return 5;
  return 0;
}

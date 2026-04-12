// ═══════════════════════════════════════════════════════════════
// STOCKCLAW — FRED Client (client-side)
// ═══════════════════════════════════════════════════════════════
// Wraps /api/macro/fred proxy for MACRO agent use

export interface FredSeriesData {
  seriesId: string;
  title: string;
  latest: { date: string; value: number } | null;
  previous: { date: string; value: number } | null;
  change: number | null;
  changePct: number | null;
}

export interface FredMacroData {
  fedFundsRate: FredSeriesData | null;
  treasury10y: FredSeriesData | null;
  treasury2y: FredSeriesData | null;
  yieldCurve: FredSeriesData | null;
  cpi: FredSeriesData | null;
  m2: FredSeriesData | null;
  updatedAt: number;
}

/** Fetch FRED macro data from our proxy */
export async function fetchFredData(): Promise<FredMacroData | null> {
  try {
    const res = await fetch('/api/macro/fred', {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.data ?? null;
  } catch (err) {
    console.error('[FRED] fetch error:', err);
    return null;
  }
}

/**
 * Fed Funds Rate score for MACRO agent.
 * Higher rates → tighter money → bearish for crypto.
 * Rate cuts → bullish. Rate hikes → bearish.
 * Range: -30 to +30
 */
export function fedFundsToScore(rate: number, change: number | null): number {
  let score = 0;
  if (rate > 5.5) score -= 25;
  else if (rate > 5.0) score -= 15;
  else if (rate > 4.0) score -= 5;
  else if (rate < 2.0) score += 20;
  else if (rate < 3.0) score += 10;

  if (change !== null) {
    if (change < -0.25) score += 15;
    else if (change < 0) score += 8;
    else if (change > 0.25) score -= 15;
    else if (change > 0) score -= 8;
  }
  return Math.round(Math.max(-30, Math.min(30, score)));
}

/**
 * Yield curve score: Inverted → recession risk → bearish
 * Range: -25 to +25
 */
export function yieldCurveToScore(spread: number): number {
  if (spread < -0.5) return -25;
  if (spread < 0) return -15;
  if (spread < 0.3) return -5;
  if (spread > 1.5) return 20;
  if (spread > 0.5) return 10;
  return 0;
}

/**
 * M2 money supply score: expanding = bullish, contracting = bearish
 * Range: -20 to +20
 */
export function m2ToScore(changePct: number | null): number {
  if (changePct == null) return 0;
  if (changePct > 1.0) return 20;
  if (changePct > 0.3) return 10;
  if (changePct > 0) return 5;
  if (changePct < -0.5) return -20;
  if (changePct < 0) return -10;
  return 0;
}

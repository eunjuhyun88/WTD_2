// ═══════════════════════════════════════════════════════════════
// STOCKCLAW — Macro Indicators Client
// ═══════════════════════════════════════════════════════════════
// DXY, S&P500, US10Y from our Yahoo proxy
// Maps to: MACRO agent → DXY_TREND, EQUITY_TREND, YIELD_TREND

export interface MacroIndicator {
  price: number;
  prevClose: number | null;
  changePct: number | null;
  trend1m: number | null;
  updatedAt: number;
}

export interface MacroIndicators {
  dxy: MacroIndicator | null;
  spx: MacroIndicator | null;
  us10y: MacroIndicator | null;
}

export async function fetchMacroIndicators(): Promise<MacroIndicators | null> {
  try {
    const res = await fetch('/api/macro/indicators', {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.data ?? null;
  } catch (err) {
    console.error('[MacroIndicators] fetch error:', err);
    return null;
  }
}

/**
 * DXY trend score: DXY up = crypto bearish, DXY down = crypto bullish
 * Returns -40 to +40
 */
export function dxyToScore(changePct: number, trend1m: number | null): number {
  let score = 0;
  // Short-term: daily change
  score += changePct > 0.3 ? -15 : changePct < -0.3 ? 15 : -changePct * 30;
  // Medium-term: 1-month trend
  if (trend1m != null) {
    score += trend1m > 2 ? -20 : trend1m < -2 ? 20 : -trend1m * 8;
  }
  return Math.round(Math.max(-40, Math.min(40, score)));
}

/**
 * Equity trend score: SPX up = risk-on = crypto bullish
 * Returns -30 to +30
 */
export function equityToScore(changePct: number, trend1m: number | null): number {
  let score = 0;
  score += changePct > 0.5 ? 10 : changePct < -0.5 ? -10 : changePct * 15;
  if (trend1m != null) {
    score += trend1m > 3 ? 15 : trend1m < -3 ? -15 : trend1m * 4;
  }
  return Math.round(Math.max(-30, Math.min(30, score)));
}

/**
 * Yield trend: rising yields = tighter money = crypto bearish
 * Returns -25 to +25
 */
export function yieldToScore(changePct: number): number {
  const score = changePct > 2 ? -20 : changePct < -2 ? 20 : -changePct * 8;
  return Math.round(Math.max(-25, Math.min(25, score)));
}

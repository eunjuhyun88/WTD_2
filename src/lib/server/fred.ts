// ═══════════════════════════════════════════════════════════════
// Stockclaw — FRED API Client (server-side)
// ═══════════════════════════════════════════════════════════════
// Federal Reserve Economic Data — macro indicators for MACRO agent
// Series: Fed Funds Rate, 10Y/2Y Treasury, Yield Curve, CPI, M2

import { env } from '$env/dynamic/private';
import { getCached, setCache } from './providers/cache';

const FRED_BASE = 'https://api.stlouisfed.org/fred';
const CACHE_TTL = 600_000; // 10 min (FRED data updates daily/monthly)

function apiKey(): string {
  return env.FRED_API_KEY?.trim() ?? '';
}

export function hasFredKey(): boolean {
  return apiKey().length > 0;
}

// ─── Types ────────────────────────────────────────────────────

export interface FredObservation {
  date: string;       // "2026-02-20"
  value: number;
}

export interface FredSeries {
  seriesId: string;
  title: string;
  latest: FredObservation | null;
  previous: FredObservation | null;
  change: number | null;         // latest - previous
  changePct: number | null;      // % change
}

export interface FredMacroData {
  fedFundsRate: FredSeries | null;
  treasury10y: FredSeries | null;
  treasury2y: FredSeries | null;
  yieldCurve: FredSeries | null;   // T10Y2Y (10Y - 2Y spread)
  cpi: FredSeries | null;
  m2: FredSeries | null;
  updatedAt: number;
}

// ─── Fetcher ──────────────────────────────────────────────────

async function fetchFredSeries(seriesId: string, limit = 5): Promise<FredSeries | null> {
  const key = apiKey();
  if (!key) return null;

  const cacheKey = `fred:${seriesId}`;
  const cached = getCached<FredSeries>(cacheKey);
  if (cached) return cached;

  try {
    const url = new URL(`${FRED_BASE}/series/observations`);
    url.searchParams.set('series_id', seriesId);
    url.searchParams.set('api_key', key);
    url.searchParams.set('file_type', 'json');
    url.searchParams.set('sort_order', 'desc');
    url.searchParams.set('limit', String(limit));

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch(url.toString(), { signal: ctrl.signal });
      if (!res.ok) {
        console.error(`[FRED] ${seriesId}: ${res.status} ${res.statusText}`);
        return null;
      }
      const json = await res.json();
      const observations: Array<{ date: string; value: string }> = json?.observations ?? [];

      // Filter valid numeric observations (FRED uses "." for missing)
      const valid = observations
        .filter(o => o.value !== '.' && !isNaN(Number(o.value)))
        .map(o => ({ date: o.date, value: Number(o.value) }));

      if (valid.length === 0) return null;

      const latest = valid[0];
      const previous = valid.length > 1 ? valid[1] : null;
      const change = previous ? latest.value - previous.value : null;
      const changePct = previous && previous.value !== 0
        ? ((latest.value - previous.value) / Math.abs(previous.value)) * 100
        : null;

      const result: FredSeries = {
        seriesId,
        title: seriesId,
        latest,
        previous,
        change: change !== null ? Math.round(change * 10000) / 10000 : null,
        changePct: changePct !== null ? Math.round(changePct * 100) / 100 : null,
      };

      setCache(cacheKey, result, CACHE_TTL);
      return result;
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    console.error(`[FRED] ${seriesId} error:`, err);
    return null;
  }
}

// ─── Series IDs ───────────────────────────────────────────────

export const FRED_SERIES = {
  FED_FUNDS:   'FEDFUNDS',     // Federal Funds Effective Rate
  TREASURY_10Y: 'DGS10',       // 10-Year Treasury Constant Maturity
  TREASURY_2Y:  'DGS2',        // 2-Year Treasury Constant Maturity
  YIELD_CURVE:  'T10Y2Y',      // 10Y-2Y Spread (yield curve)
  CPI:          'CPIAUCSL',     // Consumer Price Index
  M2:           'M2SL',         // M2 Money Supply
} as const;

// ─── Aggregate Fetch ──────────────────────────────────────────

export async function fetchFredMacroData(): Promise<FredMacroData> {
  const [fedFunds, t10y, t2y, yieldCurve, cpi, m2] = await Promise.allSettled([
    fetchFredSeries(FRED_SERIES.FED_FUNDS),
    fetchFredSeries(FRED_SERIES.TREASURY_10Y),
    fetchFredSeries(FRED_SERIES.TREASURY_2Y),
    fetchFredSeries(FRED_SERIES.YIELD_CURVE),
    fetchFredSeries(FRED_SERIES.CPI),
    fetchFredSeries(FRED_SERIES.M2),
  ]);

  return {
    fedFundsRate: fedFunds.status === 'fulfilled' ? fedFunds.value : null,
    treasury10y:  t10y.status === 'fulfilled' ? t10y.value : null,
    treasury2y:   t2y.status === 'fulfilled' ? t2y.value : null,
    yieldCurve:   yieldCurve.status === 'fulfilled' ? yieldCurve.value : null,
    cpi:          cpi.status === 'fulfilled' ? cpi.value : null,
    m2:           m2.status === 'fulfilled' ? m2.value : null,
    updatedAt:    Date.now(),
  };
}

// ─── Scoring Helpers ──────────────────────────────────────────

/**
 * Fed Funds Rate score: Higher rates = tighter money = bearish for crypto
 * Range: -30 to +30
 */
export function fedFundsToScore(rate: number, change: number | null): number {
  let score = 0;
  // Absolute level
  if (rate > 5.5) score -= 25;
  else if (rate > 5.0) score -= 15;
  else if (rate > 4.0) score -= 5;
  else if (rate < 2.0) score += 20;
  else if (rate < 3.0) score += 10;

  // Direction matters more: rate cuts = bullish
  if (change !== null) {
    if (change < -0.25) score += 15;       // rate cut
    else if (change < 0) score += 8;
    else if (change > 0.25) score -= 15;   // rate hike
    else if (change > 0) score -= 8;
  }
  return Math.round(Math.max(-30, Math.min(30, score)));
}

/**
 * Yield curve score: Inverted = recession fear = bearish
 * T10Y2Y < 0 = inverted, T10Y2Y > 0 = normal
 * Range: -25 to +25
 */
export function yieldCurveToScore(spread: number): number {
  if (spread < -0.5) return -25;   // deeply inverted
  if (spread < 0) return -15;      // inverted
  if (spread < 0.3) return -5;     // flat (caution)
  if (spread > 1.5) return 20;     // steep (growth)
  if (spread > 0.5) return 10;     // normal
  return 0;
}

/**
 * M2 money supply score: expanding M2 = more liquidity = bullish
 * changePct is month-over-month
 * Range: -20 to +20
 */
export function m2ToScore(changePct: number | null): number {
  if (changePct == null) return 0;
  if (changePct > 1.0) return 20;     // rapid expansion
  if (changePct > 0.3) return 10;     // healthy growth
  if (changePct > 0) return 5;
  if (changePct < -0.5) return -20;   // contraction
  if (changePct < 0) return -10;
  return 0;
}

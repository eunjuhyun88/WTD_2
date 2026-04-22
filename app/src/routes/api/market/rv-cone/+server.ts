/**
 * GET /api/market/rv-cone?symbol=BTCUSDT
 *
 * W-0122-F — Realized Volatility Cone.
 *
 * Computes annualized realized vol at multiple lookback windows (7, 14, 30, 60, 90 days)
 * using 180 days of daily closes, and returns:
 *   - Current RV per window
 *   - 180-day min/p10/p50/p90/max per window (the "cone")
 *   - Position of current within the cone (0-100 percentile)
 *
 * The cone is the standard RV visualization used by options desks — if current IV
 * (options-implied vol) is priced below the RV cone's p50, options are cheap.
 *
 * Source: Binance daily klines (free).
 * Cache: 1 hour.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { chartFeedLimiter } from '$lib/server/rateLimit';
import { getRequestIp } from '$lib/server/requestIp';

export interface RvConePayload {
  symbol: string;
  at: number;
  /** Windows in days that were computed. */
  windows: number[];
  /** Current annualized RV per window (e.g. 0.45 = 45%). */
  current: Record<string, number>;
  /** Per-window p10/p50/p90/min/max from 180d of rolling RV computations. */
  cone: Record<string, { min: number; p10: number; p50: number; p90: number; max: number }>;
  /** Current reading's percentile within its own window's historical series. */
  percentile: Record<string, number>;
}

const VALID_SYMBOL = /^[A-Z0-9]{3,12}USDT$/;
const CACHE_TTL_MS = 60 * 60_000; // 1h
const TIMEOUT_MS = 10_000;
const WINDOWS = [7, 14, 30, 60, 90];
const cache = new Map<string, { at: number; payload: RvConePayload }>();

async function safeFetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'User-Agent': 'cogochi-terminal/rv-cone' },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// Binance kline format: [openTime, open, high, low, close, vol, ...]
type BinanceKline = [number, string, string, string, string, string, ...unknown[]];

/** Annualized RV from an array of log-returns. */
function annualizedRV(logReturns: number[]): number {
  if (logReturns.length < 2) return 0;
  const mean = logReturns.reduce((s, r) => s + r, 0) / logReturns.length;
  const variance = logReturns.reduce((s, r) => s + (r - mean) ** 2, 0) / (logReturns.length - 1);
  return Math.sqrt(variance) * Math.sqrt(365);
}

/** Rolling RV series: at index i, RV of the last `window` daily returns ending at i. */
function rollingRvSeries(logReturns: number[], window: number): number[] {
  const out: number[] = [];
  for (let i = window; i <= logReturns.length; i++) {
    out.push(annualizedRV(logReturns.slice(i - window, i)));
  }
  return out;
}

function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  const idx = Math.floor((sorted.length - 1) * q);
  return sorted[idx];
}

export const GET: RequestHandler = async ({ url, request, getClientAddress }) => {
  const symbol = (url.searchParams.get('symbol') ?? 'BTCUSDT').toUpperCase();
  if (!VALID_SYMBOL.test(symbol)) {
    return json({ error: 'invalid symbol' }, { status: 400 });
  }

  const ip = getRequestIp({ request, getClientAddress });
  if (!chartFeedLimiter.check(ip)) {
    return json({ error: 'rate limited' }, { status: 429, headers: { 'Retry-After': '60' } });
  }

  const cached = cache.get(symbol);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return json(cached.payload, { headers: { 'X-Cache': 'HIT' } });
  }

  // 180 daily candles → 179 log returns, enough for rolling 90-window × ~90 samples.
  const klines = await safeFetchJson<BinanceKline[]>(
    `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1d&limit=180`
  );

  if (!Array.isArray(klines) || klines.length < 100) {
    return json({ error: 'upstream_unavailable' }, { status: 503 });
  }

  const closes = klines.map(k => Number(k[4])).filter(v => Number.isFinite(v) && v > 0);
  const logReturns: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    logReturns.push(Math.log(closes[i] / closes[i - 1]));
  }

  const currentMap: Record<string, number> = {};
  const coneMap: RvConePayload['cone'] = {};
  const percentileMap: Record<string, number> = {};

  for (const w of WINDOWS) {
    if (logReturns.length < w + 5) continue;
    const series = rollingRvSeries(logReturns, w);
    if (!series.length) continue;
    const current = series[series.length - 1];
    const sorted = [...series].sort((a, b) => a - b);
    currentMap[String(w)] = current;
    coneMap[String(w)] = {
      min: sorted[0],
      p10: quantile(sorted, 0.1),
      p50: quantile(sorted, 0.5),
      p90: quantile(sorted, 0.9),
      max: sorted[sorted.length - 1],
    };
    // Current percentile within historical series
    let lo = 0, hi = sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid] <= current) lo = mid + 1;
      else hi = mid;
    }
    percentileMap[String(w)] = Math.max(0, Math.min(100, (lo / sorted.length) * 100));
  }

  const payload: RvConePayload = {
    symbol,
    at: Date.now(),
    windows: WINDOWS,
    current: currentMap,
    cone: coneMap,
    percentile: percentileMap,
  };

  cache.set(symbol, { at: Date.now(), payload });
  return json(payload, { headers: { 'X-Cache': 'MISS' } });
};

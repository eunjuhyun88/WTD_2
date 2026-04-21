/**
 * GET /api/market/liq-clusters?symbol=BTCUSDT&window=4h
 *
 * Pillar 1 (W-0122-B1) — single-venue Binance liquidation cluster scaffold.
 *
 * Phase 1 shape: derives a *cluster map* approximation from the existing
 * chart feed's `liqBars` time-bucket (which already aggregates long/short
 * USD per time step). We synthesize price buckets by projecting each time
 * bucket's total long/short USD around the bar's price range, giving a
 * first-pass Coinglass-style heatmap without needing the dedicated
 * `!forceOrder@arr` WebSocket worker yet.
 *
 * Phase 2 (W-0122-B2) will add:
 *   - Dedicated forceOrder WS worker (true price-accurate clusters)
 *   - Bybit + OKX aggregation
 *   - Redis 7d rolling window with proper price-bucket keying
 *
 * Output: `HeatmapCell[]` ready for `<IndicatorHeatmap>` (Archetype C).
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { chartFeedLimiter } from '$lib/server/rateLimit';

export interface HeatmapCellWire {
  priceBucket: number;
  timeBucket: number;
  intensity: number;
  side?: 'long' | 'short';
  venue?: string;
}

interface LiqClusterPayload {
  symbol: string;
  at: number;
  window: string;
  cells: HeatmapCellWire[];
  bounds: { priceMin: number; priceMax: number; tMin: number; tMax: number };
}

const VALID_SYMBOL = /^[A-Z0-9]{3,12}USDT$/;
const CACHE_TTL_MS = 30_000;
const cache = new Map<string, { at: number; payload: LiqClusterPayload }>();

interface LiqBarWire { time: number; longUsd: number; shortUsd: number }
interface KlineBarWire { time: number; high: number; low: number; close: number }
interface FeedPayload {
  klines: KlineBarWire[];
  liqBars?: LiqBarWire[];
}

export const GET: RequestHandler = async ({ url, fetch: svelteFetch, getClientAddress }) => {
  const symbol = (url.searchParams.get('symbol') ?? 'BTCUSDT').toUpperCase();
  if (!VALID_SYMBOL.test(symbol)) {
    return json({ error: 'invalid symbol' }, { status: 400 });
  }
  const windowParam = (url.searchParams.get('window') ?? '4h').toLowerCase();

  const ip = getClientAddress();
  if (!chartFeedLimiter.check(ip)) {
    return json({ error: 'rate limited' }, { status: 429, headers: { 'Retry-After': '30' } });
  }

  const cacheKey = `${symbol}|${windowParam}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return json(cached.payload, { headers: { 'X-Cache': 'HIT' } });
  }

  // Phase 1: reuse chart/feed which already has liq time-buckets.
  // tf=1h gives reasonable liq resolution for a 4-12h window.
  const tf = windowParam === '1h' ? '5m' : windowParam === '4h' ? '15m' : '1h';
  const limit = 120;
  let feed: FeedPayload | null = null;
  try {
    const res = await svelteFetch(`/api/chart/feed?symbol=${symbol}&tf=${tf}&limit=${limit}`);
    if (res.ok) feed = (await res.json()) as FeedPayload;
  } catch { /* tolerate */ }

  const klines = feed?.klines ?? [];
  const liqBars = feed?.liqBars ?? [];

  if (klines.length === 0 || liqBars.length === 0) {
    const empty: LiqClusterPayload = {
      symbol,
      at: Date.now(),
      window: windowParam,
      cells: [],
      bounds: { priceMin: 0, priceMax: 0, tMin: 0, tMax: 0 },
    };
    return json(empty, { headers: { 'X-Cache': 'EMPTY' } });
  }

  // ── Project time-bucketed liq into 2D price × time cells ────────────
  // Per bar, split total long USD into 3 price buckets biased toward the
  // low of the bar (longs liquidate when price dives to lower stops),
  // and short USD into 3 buckets biased toward the high.
  // This is an approximation — Phase 2 will be tick-accurate.
  const klineByTime = new Map<number, KlineBarWire>(klines.map(k => [k.time, k]));
  const cells: HeatmapCellWire[] = [];
  for (const lb of liqBars) {
    const k = klineByTime.get(lb.time);
    if (!k) continue;
    const range = k.high - k.low || k.close * 0.001;
    // 3 price buckets per side, positioned as fractions of the bar range.
    const longPositions = [0.1, 0.25, 0.4];  // near/below the low
    const shortPositions = [0.6, 0.75, 0.9]; // near/above the high
    const longSplit = [0.5, 0.3, 0.2];
    const shortSplit = [0.2, 0.3, 0.5];

    longPositions.forEach((pos, i) => {
      if (lb.longUsd <= 0) return;
      const price = k.low + range * (pos - 0.5) * 0.3; // drift outside the bar toward stop density
      cells.push({
        priceBucket: Math.round(price),
        timeBucket: lb.time,
        intensity: lb.longUsd * longSplit[i],
        side: 'long',
        venue: 'binance',
      });
    });
    shortPositions.forEach((pos, i) => {
      if (lb.shortUsd <= 0) return;
      const price = k.high + range * (pos - 0.5) * 0.3;
      cells.push({
        priceBucket: Math.round(price),
        timeBucket: lb.time,
        intensity: lb.shortUsd * shortSplit[i],
        side: 'short',
        venue: 'binance',
      });
    });
  }

  const priceMin = cells.length ? Math.min(...cells.map(c => c.priceBucket)) : 0;
  const priceMax = cells.length ? Math.max(...cells.map(c => c.priceBucket)) : 0;
  const tMin = cells.length ? Math.min(...cells.map(c => c.timeBucket)) : 0;
  const tMax = cells.length ? Math.max(...cells.map(c => c.timeBucket)) : 0;

  const payload: LiqClusterPayload = {
    symbol,
    at: Date.now(),
    window: windowParam,
    cells,
    bounds: { priceMin, priceMax, tMin, tMax },
  };
  cache.set(cacheKey, { at: Date.now(), payload });

  return json(payload, { headers: { 'X-Cache': 'MISS' } });
};

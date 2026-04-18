// ═══════════════════════════════════════════════════════════════
// WTD — Cycle Kline Fetch API
// ═══════════════════════════════════════════════════════════════
//
// Fetches historical BTC klines for a given market cycle.
// Handles Binance API pagination (max 1000 per request).
// Server-side in-memory cache to avoid repeated fetches.

import { json, error, type RequestHandler } from '@sveltejs/kit';
import type { BinanceKline } from '$lib/contracts/marketContext';
import { getCycle, dateToMs, BACKTEST_INTERVALS } from '$lib/data/cycles';
import type { BacktestInterval } from '$lib/data/cycles';

const BINANCE_BASE = 'https://api.binance.com';
const MAX_KLINES_PER_REQUEST = 1000;
const FETCH_TIMEOUT = 15_000; // 15s for historical data

// ─── Server-side cache ──────────────────────────────────────

interface CacheEntry {
  klines: BinanceKline[];
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours — historical data doesn't change

function cacheKey(cycleId: string, interval: string): string {
  return `${cycleId}:${interval}`;
}

// ─── Interval to milliseconds ───────────────────────────────

const INTERVAL_MS: Record<string, number> = {
  '1m': 60_000,
  '5m': 300_000,
  '15m': 900_000,
  '1h': 3_600_000,
  '4h': 14_400_000,
  '1d': 86_400_000,
};

// ─── Fetch klines with pagination ───────────────────────────

async function fetchKlinesPaginated(
  symbol: string,
  interval: string,
  startTimeMs: number,
  endTimeMs: number,
): Promise<BinanceKline[]> {
  const allKlines: BinanceKline[] = [];
  let currentStart = startTimeMs;
  const intervalMs = INTERVAL_MS[interval];
  if (!intervalMs) throw new Error(`Unsupported interval: ${interval}`);

  while (currentStart < endTimeMs) {
    const url = new URL(`${BINANCE_BASE}/api/v3/klines`);
    url.searchParams.set('symbol', symbol);
    url.searchParams.set('interval', interval);
    url.searchParams.set('startTime', String(currentStart));
    url.searchParams.set('endTime', String(endTimeMs));
    url.searchParams.set('limit', String(MAX_KLINES_PER_REQUEST));

    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });

    if (!res.ok) {
      throw new Error(`Binance API error: ${res.status} ${res.statusText}`);
    }

    const data: unknown[][] = await res.json();
    if (data.length === 0) break;

    for (const k of data) {
      allKlines.push({
        time: Math.floor(Number(k[0]) / 1000), // ms → seconds for LightweightCharts
        open: parseFloat(String(k[1])),
        high: parseFloat(String(k[2])),
        low: parseFloat(String(k[3])),
        close: parseFloat(String(k[4])),
        volume: parseFloat(String(k[5])),
      });
    }

    // Move start to after last kline
    const lastOpenTimeMs = Number(data[data.length - 1][0]);
    currentStart = lastOpenTimeMs + intervalMs;

    // Safety: if we got fewer than limit, we're done
    if (data.length < MAX_KLINES_PER_REQUEST) break;

    // Rate limit: small delay between requests
    await new Promise(r => setTimeout(r, 100));
  }

  return allKlines;
}

// ─── GET handler ────────────────────────────────────────────

export const GET: RequestHandler = async ({ url }) => {
  const cycleId = url.searchParams.get('cycleId');
  const interval = url.searchParams.get('interval') || '4h';

  if (!cycleId) {
    return error(400, 'Missing cycleId parameter');
  }

  if (!BACKTEST_INTERVALS.includes(interval as BacktestInterval)) {
    return error(400, `Invalid interval. Supported: ${BACKTEST_INTERVALS.join(', ')}`);
  }

  const cycle = getCycle(cycleId);
  if (!cycle) {
    return error(404, `Cycle not found: ${cycleId}`);
  }

  // Check cache
  const key = cacheKey(cycleId, interval);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return json({
      success: true,
      cycleId,
      interval,
      count: cached.klines.length,
      klines: cached.klines,
      cached: true,
    });
  }

  // Fetch from Binance
  try {
    const startMs = dateToMs(cycle.startDate);
    const endMs = dateToMs(cycle.endDate);

    const klines = await fetchKlinesPaginated('BTCUSDT', interval, startMs, endMs);

    // Store in cache
    cache.set(key, { klines, fetchedAt: Date.now() });

    // Limit cache size (keep 50 most recent entries)
    if (cache.size > 50) {
      const oldest = [...cache.entries()]
        .sort((a, b) => a[1].fetchedAt - b[1].fetchedAt)
        .slice(0, cache.size - 50);
      for (const [k] of oldest) cache.delete(k);
    }

    return json({
      success: true,
      cycleId,
      interval,
      count: klines.length,
      klines,
      cached: false,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return error(502, `Failed to fetch klines: ${msg}`);
  }
};

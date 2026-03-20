// ═══════════════════════════════════════════════════════════════
// Stockclaw — Server-side Binance REST Client (B-02)
// ═══════════════════════════════════════════════════════════════
// Public endpoints — no API key. Server-side caching via LRU cache.

import { getCached, setCache } from './providers/cache';
import { toBinanceInterval } from '$lib/utils/timeframe';
import type { BinanceKline, Binance24hr } from '$lib/engine/types';

// Re-export for convenience (consumers can import from here or from engine/types)
export type { BinanceKline, Binance24hr } from '$lib/engine/types';

const BASE = 'https://api.binance.com';
const FETCH_TIMEOUT = 8_000;
const KLINE_CACHE_TTL = 60_000;    // 1min — klines change fast
const TICKER_CACHE_TTL = 30_000;   // 30s
const EXTENDED_INTERVALS = new Set(['1M']);

function normalizeServerInterval(interval: string): string {
  const trimmed = String(interval || '').trim();
  if (EXTENDED_INTERVALS.has(trimmed)) return trimmed;
  return toBinanceInterval(trimmed);
}

// ─── Klines ──────────────────────────────────────────────────

export async function fetchKlinesServer(
  symbol: string,
  interval: string = '4h',
  limit: number = 200
): Promise<BinanceKline[]> {
  const normalizedInterval = normalizeServerInterval(interval);
  const cacheKey = `binance:klines:${symbol}:${normalizedInterval}:${limit}`;
  const cached = getCached<BinanceKline[]>(cacheKey);
  if (cached) return cached;

  const url = `${BASE}/api/v3/klines?symbol=${symbol}&interval=${normalizedInterval}&limit=${limit}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT) });
  if (!res.ok) throw new Error(`Binance klines ${res.status}`);

  const data: unknown[][] = await res.json();
  const klines: BinanceKline[] = data.map((k) => ({
    time: Math.floor(Number(k[0]) / 1000),
    open: parseFloat(String(k[1])),
    high: parseFloat(String(k[2])),
    low: parseFloat(String(k[3])),
    close: parseFloat(String(k[4])),
    volume: parseFloat(String(k[5])),
  }));

  setCache(cacheKey, klines, KLINE_CACHE_TTL);
  return klines;
}

// ─── 24hr Ticker ─────────────────────────────────────────────

export async function fetch24hrServer(symbol: string): Promise<Binance24hr> {
  const cacheKey = `binance:24hr:${symbol}`;
  const cached = getCached<Binance24hr>(cacheKey);
  if (cached) return cached;

  const url = `${BASE}/api/v3/ticker/24hr?symbol=${symbol}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT) });
  if (!res.ok) throw new Error(`Binance 24hr ${res.status}`);

  const data: Binance24hr = await res.json();
  setCache(cacheKey, data, TICKER_CACHE_TTL);
  return data;
}

// ─── Symbol mapping ──────────────────────────────────────────

export function pairToSymbol(pair: string): string {
  return pair.replace('/', '');
}

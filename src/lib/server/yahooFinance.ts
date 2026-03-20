// ═══════════════════════════════════════════════════════════════
// Stockclaw — Yahoo Finance server client
// ═══════════════════════════════════════════════════════════════

import { getCached, setCache } from './providers/cache';
import { normalizeSymbol } from '$lib/utils/price';

const YAHOO_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';
const CACHE_TTL = 5 * 60_000; // 5분 (DXY/SPX/수익률은 느리게 변동)

export type YahooPoint = {
  timestampMs: number;
  close: number;
  high: number | null;
  low: number | null;
  volume: number | null;
};

export type YahooSeries = {
  symbol: string;
  points: YahooPoint[];
  previousClose: number | null;
  regularMarketPrice: number | null;
  regularMarketChangePercent: number | null;
  updatedAt: number;
};

function isAllowedSymbol(symbol: string): boolean {
  return /^[A-Z0-9^.=/-]{1,20}$/.test(symbol);
}

async function fetchJson(symbol: string, range: string, interval: string, timeoutMs = 8000): Promise<any> {
  const qs = new URLSearchParams({
    range,
    interval,
    includePrePost: 'false',
    events: 'div,splits',
  });
  const url = `${YAHOO_BASE}/${encodeURIComponent(symbol)}?${qs.toString()}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`yahoo ${res.status}`);
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchYahooSeries(rawSymbol: string, range = '1mo', interval = '1d'): Promise<YahooSeries | null> {
  const symbol = normalizeSymbol(rawSymbol);
  if (!isAllowedSymbol(symbol)) return null;

  const cacheKey = `yahoo:${symbol}:${range}:${interval}`;
  const cached = getCached<YahooSeries>(cacheKey);
  if (cached) return cached;

  try {
    const payload = await fetchJson(symbol, range, interval);
    const result = payload?.chart?.result?.[0];
    if (!result) return null;

    const timestamps: number[] = Array.isArray(result.timestamp) ? result.timestamp : [];
    const quote = result?.indicators?.quote?.[0] ?? {};
    const closes: unknown[] = Array.isArray(quote?.close) ? quote.close : [];
    const highs: unknown[] = Array.isArray(quote?.high) ? quote.high : [];
    const lows: unknown[] = Array.isArray(quote?.low) ? quote.low : [];
    const volumes: unknown[] = Array.isArray(quote?.volume) ? quote.volume : [];

    const points: YahooPoint[] = [];
    for (let i = 0; i < timestamps.length; i += 1) {
      const close = Number(closes[i]);
      if (!Number.isFinite(close)) continue;
      points.push({
        timestampMs: Number(timestamps[i]) * 1000,
        close,
        high: Number.isFinite(Number(highs[i])) ? Number(highs[i]) : null,
        low: Number.isFinite(Number(lows[i])) ? Number(lows[i]) : null,
        volume: Number.isFinite(Number(volumes[i])) ? Number(volumes[i]) : null,
      });
    }

    const meta = result?.meta ?? {};
    const nowSec = Number(meta?.regularMarketTime);
    const series: YahooSeries = {
      symbol,
      points,
      previousClose: Number.isFinite(Number(meta?.previousClose)) ? Number(meta.previousClose) : null,
      regularMarketPrice: Number.isFinite(Number(meta?.regularMarketPrice)) ? Number(meta.regularMarketPrice) : null,
      regularMarketChangePercent: Number.isFinite(Number(meta?.regularMarketChangePercent))
        ? Number(meta.regularMarketChangePercent)
        : null,
      updatedAt: Number.isFinite(nowSec) ? nowSec * 1000 : Date.now(),
    };
    setCache(cacheKey, series, CACHE_TTL);
    return series;
  } catch (error) {
    console.error(`[yahoo/${symbol}] fetch failed:`, error);
    return null;
  }
}

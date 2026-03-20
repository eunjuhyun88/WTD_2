// ═══════════════════════════════════════════════════════════════
// STOCKCLAW — Binance API Service (Public Market Data)
// ═══════════════════════════════════════════════════════════════
// Uses public endpoints — no API key required
// Base: https://api.binance.com or https://data-api.binance.vision

import { toBinanceInterval } from '$lib/utils/timeframe';
import type { BinanceKline, Binance24hr } from '$lib/engine/types';

const BASE = 'https://api.binance.com';
const DATA_BASE = 'https://data-api.binance.vision';
const FETCH_TIMEOUT = 8000; // 8s timeout for all REST calls

// ─── Types ───────────────────────────────────────────────────
// Canonical types in engine/types.ts — re-export for convenience
export type { BinanceKline, Binance24hr } from '$lib/engine/types';

export interface BinanceTicker {
  symbol: string;
  price: string;
}

// ─── Interval mapping ────────────────────────────────────────
export const INTERVALS: Record<string, string> = {
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  '30m': '30m',
  '1h': '1h',
  '4h': '4h',
  '1d': '1d',
  '1w': '1w',
  '1H': '1h',
  '4H': '4h',
  '1D': '1d',
  '1W': '1w',
};

// ─── Symbol mapping ──────────────────────────────────────────
export function pairToSymbol(pair: string): string {
  return pair.replace('/', '');
}

// ─── Fetch Klines (Candlestick Data) ─────────────────────────
export async function fetchKlines(
  symbol: string,
  interval: string = '4h',
  limit: number = 1000,
  endTime?: number // ms timestamp — fetch candles BEFORE this time
): Promise<BinanceKline[]> {
  const normalizedInterval = toBinanceInterval(interval);
  let url = `${BASE}/api/v3/klines?symbol=${symbol}&interval=${normalizedInterval}&limit=${limit}`;
  if (endTime) url += `&endTime=${endTime}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT) });
  if (!res.ok) throw new Error(`Binance klines error: ${res.status}`);

  const data: unknown[][] = await res.json();

  return data.map((k) => ({
    time: Math.floor(Number(k[0]) / 1000), // ms → seconds for LightweightCharts
    open: parseFloat(String(k[1])),
    high: parseFloat(String(k[2])),
    low: parseFloat(String(k[3])),
    close: parseFloat(String(k[4])),
    volume: parseFloat(String(k[5])),
  }));
}

// ─── Fetch Current Price ─────────────────────────────────────
export async function fetchPrice(symbol: string): Promise<number> {
  const url = `${BASE}/api/v3/ticker/price?symbol=${symbol}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT) });
  if (!res.ok) throw new Error(`Binance price error: ${res.status}`);
  const data: BinanceTicker = await res.json();
  return parseFloat(data.price);
}

// ─── Fetch Multiple Prices ───────────────────────────────────
export async function fetchPrices(symbols: string[]): Promise<Record<string, number>> {
  const query = symbols.map(s => `"${s}"`).join(',');
  const url = `${BASE}/api/v3/ticker/price?symbols=[${query}]`;
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT) });
  if (!res.ok) throw new Error(`Binance prices error: ${res.status}`);
  const data: BinanceTicker[] = await res.json();

  const result: Record<string, number> = {};
  for (const t of data) {
    result[t.symbol] = parseFloat(t.price);
  }
  return result;
}

// ─── Fetch 24hr Ticker ───────────────────────────────────────
export async function fetch24hr(symbol: string): Promise<Binance24hr> {
  const url = `${BASE}/api/v3/ticker/24hr?symbol=${symbol}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT) });
  if (!res.ok) throw new Error(`Binance 24hr error: ${res.status}`);
  return await res.json();
}

// ─── Fetch Multiple 24hr Tickers ─────────────────────────────
export async function fetch24hrMulti(symbols: string[]): Promise<Binance24hr[]> {
  const query = symbols.map(s => `"${s}"`).join(',');
  const url = `${BASE}/api/v3/ticker/24hr?symbols=[${query}]`;
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT) });
  if (!res.ok) throw new Error(`Binance 24hr multi error: ${res.status}`);
  return await res.json();
}

// ─── WebSocket for Real-time Klines (with auto-reconnect) ───
export function subscribeKlines(
  symbol: string,
  interval: string,
  onKline: (kline: BinanceKline) => void
): () => void {
  const wsSymbol = symbol.toLowerCase();
  const wsInterval = toBinanceInterval(interval);
  const url = `wss://stream.binance.com:9443/ws/${wsSymbol}@kline_${wsInterval}`;

  let ws: WebSocket | null = null;
  let destroyed = false;
  let retryDelay = 1000;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  function connect() {
    if (destroyed) return;
    ws = new WebSocket(url);

    ws.onopen = () => {
      retryDelay = 1000; // reset backoff on success
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.e === 'kline') {
        const k = msg.k;
        onKline({
          time: Math.floor(k.t / 1000),
          open: parseFloat(k.o),
          high: parseFloat(k.h),
          low: parseFloat(k.l),
          close: parseFloat(k.c),
          volume: parseFloat(k.v),
        });
      }
    };

    ws.onerror = (err) => console.error('[Binance WS] Error:', err);

    ws.onclose = () => {
      if (destroyed) return;
      // Auto-reconnect with exponential backoff (max 30s)
      retryTimer = setTimeout(() => {
        retryDelay = Math.min(retryDelay * 2, 30000);
        connect();
      }, retryDelay);
    };
  }

  connect();

  // Return cleanup function
  return () => {
    destroyed = true;
    if (retryTimer) clearTimeout(retryTimer);
    if (ws) ws.close();
  };
}

// ─── WebSocket for Real-time Mini Ticker (with auto-reconnect) ─
export interface MiniTickerUpdate {
  price: number;
  change24h: number;   // (close - open) / open * 100
  high24h: number;
  low24h: number;
  volume24h: number;   // quote volume
}

export function subscribeMiniTicker(
  symbols: string[],
  onUpdate: (prices: Record<string, number>) => void,
  onUpdateFull?: (updates: Record<string, MiniTickerUpdate>) => void
): () => void {
  const streams = symbols.map(s => `${s.toLowerCase()}@miniTicker`).join('/');
  const url = `wss://stream.binance.com:9443/stream?streams=${streams}`;

  let ws: WebSocket | null = null;
  let destroyed = false;
  let retryDelay = 1000;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  function connect() {
    if (destroyed) return;
    ws = new WebSocket(url);

    ws.onopen = () => { retryDelay = 1000; };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.data && msg.data.e === '24hrMiniTicker') {
        const d = msg.data;
        const close = parseFloat(d.c);
        const open = parseFloat(d.o);
        // 레거시 콜백 (가격만)
        onUpdate({ [d.s]: close });
        // 풀 콜백 (24h 통계 포함)
        if (onUpdateFull && Number.isFinite(open) && open > 0) {
          onUpdateFull({
            [d.s]: {
              price: close,
              change24h: ((close - open) / open) * 100,
              high24h: parseFloat(d.h),
              low24h: parseFloat(d.l),
              volume24h: parseFloat(d.q),  // quote volume
            },
          });
        }
      }
    };

    ws.onerror = (err) => console.error('[Binance WS Ticker] Error:', err);

    ws.onclose = () => {
      if (destroyed) return;
      retryTimer = setTimeout(() => {
        retryDelay = Math.min(retryDelay * 2, 30000);
        connect();
      }, retryDelay);
    };
  }

  connect();

  return () => {
    destroyed = true;
    if (retryTimer) clearTimeout(retryTimer);
    if (ws) ws.close();
  };
}

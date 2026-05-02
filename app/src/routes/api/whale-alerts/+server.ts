/**
 * GET /api/whale-alerts?symbols=BTCUSDT,ETHUSDT&limit=5
 *
 * Phase D-1 stub: returns deterministic mock whale alerts for the requested
 * watchlist symbols so the WatchlistRail UI can render real data shapes.
 *
 * Real wiring is deferred to Phase D-7 (Hyperliquid + Whale Alert API).
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export interface WhaleAlertDTO {
  symbol: string;
  amount: number;
  direction: 'buy' | 'sell';
  exchange: string;
  timestamp: number;
  confidence?: number;
}

const EXCHANGES = ['binance', 'coinbase', 'kraken', 'bybit', 'okx'];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function mockAlertsFor(symbol: string, now: number): WhaleAlertDTO[] {
  const seed = hash(symbol);
  const count = 1 + (seed % 3);
  const out: WhaleAlertDTO[] = [];
  for (let i = 0; i < count; i++) {
    const s = seed + i * 7919;
    const minutesAgo = 1 + (s % 47);
    const amount = 250_000 + ((s * 1031) % 9_500_000);
    const direction: 'buy' | 'sell' = (s & 1) === 0 ? 'buy' : 'sell';
    const exchange = EXCHANGES[s % EXCHANGES.length];
    out.push({
      symbol,
      amount,
      direction,
      exchange,
      timestamp: now - minutesAgo * 60_000,
      confidence: 60 + (s % 40),
    });
  }
  return out;
}

export const GET: RequestHandler = ({ url }) => {
  const raw = url.searchParams.get('symbols') ?? '';
  const limitParam = url.searchParams.get('limit');
  const limit = Math.max(1, Math.min(50, Number(limitParam) || 5));

  const symbols = raw
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter((s) => /^[A-Z]{2,10}USDT?$/.test(s));

  if (symbols.length === 0) {
    return json({ alerts: [] satisfies WhaleAlertDTO[] });
  }

  const now = Date.now();
  const alerts = symbols
    .flatMap((sym) => mockAlertsFor(sym, now))
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, limit);

  return json({ alerts });
};

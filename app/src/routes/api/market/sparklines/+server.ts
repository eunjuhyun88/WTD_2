import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Pin to Asia regions — Binance FAPI is geo-restricted from US (Vercel IAD1 gets 451).
export const config = {
  regions: ['sin1', 'icn1', 'hnd1'],
};

/**
 * GET /api/market/sparklines?symbols=BTCUSDT,ETHUSDT,SOLUSDT
 *
 * Returns 24h price sparkline data (1h candles) for up to 20 symbols.
 * Data sourced directly from Binance REST API.
 */

const BINANCE_BASE = 'https://fapi.binance.com';
const MAX_SYMBOLS = 20;
const KLINE_LIMIT = 24; // 24 × 1h = 24 hours

interface SparklineData {
  symbol: string;
  prices: number[];    // close prices (24 points)
  high: number;
  low: number;
  volume: number;      // total 24h volume
}

async function fetchKlines(symbol: string): Promise<SparklineData | null> {
  try {
    const url = `${BINANCE_BASE}/fapi/v1/klines?symbol=${symbol}&interval=1h&limit=${KLINE_LIMIT}`;
    const res = await fetch(url);
    if (!res.ok) return null;

    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;

    const prices = data.map((k: any[]) => parseFloat(k[4])); // close prices
    const highs = data.map((k: any[]) => parseFloat(k[2]));
    const lows = data.map((k: any[]) => parseFloat(k[3]));
    const volumes = data.map((k: any[]) => parseFloat(k[5]));

    return {
      symbol,
      prices,
      high: Math.max(...highs),
      low: Math.min(...lows),
      volume: volumes.reduce((a, b) => a + b, 0),
    };
  } catch {
    return null;
  }
}

export const GET: RequestHandler = async ({ url }) => {
  const symbolsParam = url.searchParams.get('symbols') || '';
  const symbols = symbolsParam
    .split(',')
    .map(s => s.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, MAX_SYMBOLS);

  if (symbols.length === 0) {
    return json({ error: 'symbols parameter required' }, { status: 400 });
  }

  // Fetch all in parallel with 5s timeout
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const results = await Promise.allSettled(symbols.map(fetchKlines));
    clearTimeout(timeout);

    const sparklines: Record<string, SparklineData> = {};
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) {
        sparklines[r.value.symbol] = r.value;
      }
    }

    return json(
      { sparklines },
      { headers: { 'Cache-Control': 'public, max-age=300' } } // 5min cache
    );
  } catch {
    clearTimeout(timeout);
    return json({ error: 'Failed to fetch sparklines' }, { status: 502 });
  }
};

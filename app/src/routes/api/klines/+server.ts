// ═══════════════════════════════════════════════════════════════
// W-0285 — General-purpose Klines Proxy
// ═══════════════════════════════════════════════════════════════
//
// Fetches historical OHLCV klines for any symbol/interval from Binance.
// Used by SearchResultMiniChart to render per-result candlestick previews.
//
// GET /api/klines?symbol=BTCUSDT&interval=4h&limit=60&endTime=1714000000000
//
// Returns: BinanceKline[] (time in seconds, suitable for lightweight-charts)

import { json, error, type RequestHandler } from '@sveltejs/kit';
import type { BinanceKline } from '$lib/contracts/marketContext';

const BINANCE_BASE = 'https://api.binance.com';
const FETCH_TIMEOUT = 10_000;
const MAX_LIMIT = 200;

// Short-lived cache: mini charts don't need to refresh often
const cache = new Map<string, { data: BinanceKline[]; fetchedAt: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Supported intervals (engine → Binance mapping)
const VALID_INTERVALS = new Set([
  '1m', '3m', '5m', '15m', '30m',
  '1h', '2h', '4h', '6h', '8h', '12h',
  '1d', '3d', '1w',
]);

function normalizeInterval(raw: string): string {
  const map: Record<string, string> = {
    '1H': '1h', '4H': '4h', '1D': '1d',
  };
  return map[raw] ?? raw.toLowerCase();
}

export const GET: RequestHandler = async ({ url }) => {
  const symbol   = (url.searchParams.get('symbol') ?? '').toUpperCase().trim();
  const interval = normalizeInterval(url.searchParams.get('interval') ?? '4h');
  const limit    = Math.min(parseInt(url.searchParams.get('limit') ?? '60', 10), MAX_LIMIT);
  const endTime  = url.searchParams.get('endTime'); // ms timestamp string

  if (!symbol || symbol.length < 3) {
    return error(400, 'symbol is required (min 3 chars)');
  }
  if (!VALID_INTERVALS.has(interval)) {
    return error(400, `unsupported interval: ${interval}`);
  }
  if (isNaN(limit) || limit < 1) {
    return error(400, 'limit must be a positive integer');
  }

  const cacheKey = `${symbol}:${interval}:${limit}:${endTime ?? 'now'}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return json(cached.data, {
      headers: { 'X-Cache': 'HIT' },
    });
  }

  try {
    const binanceUrl = new URL(`${BINANCE_BASE}/api/v3/klines`);
    binanceUrl.searchParams.set('symbol', symbol);
    binanceUrl.searchParams.set('interval', interval);
    binanceUrl.searchParams.set('limit', String(limit));
    if (endTime) binanceUrl.searchParams.set('endTime', endTime);

    const res = await fetch(binanceUrl.toString(), {
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });

    if (res.status === 400) {
      // Binance returns 400 for invalid symbols — surface as 422
      return error(422, `Binance rejected request for ${symbol} — symbol may not exist`);
    }
    if (!res.ok) {
      return error(502, `Binance upstream error: ${res.status}`);
    }

    const raw: unknown[][] = await res.json();
    const klines: BinanceKline[] = raw.map((k) => ({
      time: Math.floor(Number(k[0]) / 1000) as number, // ms → seconds (lightweight-charts)
      open:   parseFloat(String(k[1])),
      high:   parseFloat(String(k[2])),
      low:    parseFloat(String(k[3])),
      close:  parseFloat(String(k[4])),
      volume: parseFloat(String(k[5])),
    }));

    cache.set(cacheKey, { data: klines, fetchedAt: Date.now() });

    return json(klines, {
      headers: { 'X-Cache': 'MISS' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('TimeoutError') || msg.includes('AbortError')) {
      return error(504, 'Binance request timed out');
    }
    return error(502, `Failed to fetch klines: ${msg}`);
  }
};

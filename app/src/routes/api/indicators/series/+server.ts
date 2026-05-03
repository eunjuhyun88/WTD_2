// ═══════════════════════════════════════════════════════════════
// W-0400 Phase 2B — Indicator Series Proxy
// ═══════════════════════════════════════════════════════════════
//
// Proxies engine GET /indicators/series to client.
// Engine URL + secret headers are handled by engineFetch (server-only).
//
// GET /api/indicators/series?symbol=BTCUSDT&timeframe=15m&indicator=sma_20&limit=500
//   → { points: [{t: ms, v: float}], count: int }
//
// Rate-limited to 60 req/min per IP.
// Returns 503 + {error: 'engine_unavailable', cached: false} if engine fails.

import { json, error, type RequestHandler } from '@sveltejs/kit';
import { engineFetch } from '$lib/server/engineTransport';

// ── Rate limiter (60 req/min per IP) ────────────────────────────────────────
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();
const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60_000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now - entry.windowStart > RATE_WINDOW_MS) {
    rateLimitMap.set(ip, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

// Periodically clean stale entries (avoid unbounded growth)
setInterval(() => {
  const cutoff = Date.now() - RATE_WINDOW_MS * 2;
  for (const [key, val] of rateLimitMap.entries()) {
    if (val.windowStart < cutoff) rateLimitMap.delete(key);
  }
}, 5 * 60_000);

export const GET: RequestHandler = async ({ url, getClientAddress }) => {
  const ip = getClientAddress();
  if (!checkRateLimit(ip)) {
    return json({ error: 'rate_limit_exceeded' }, { status: 429 });
  }

  const symbol    = url.searchParams.get('symbol');
  const timeframe = url.searchParams.get('timeframe');
  const indicator = url.searchParams.get('indicator');
  const params    = url.searchParams.get('params');
  const limit     = url.searchParams.get('limit');

  if (!symbol)    return error(400, 'symbol is required');
  if (!timeframe) return error(400, 'timeframe is required');
  if (!indicator) return error(400, 'indicator is required');

  // Build engine path with forwarded params
  const engineUrl = new URL('/indicators/series', 'http://placeholder');
  engineUrl.searchParams.set('symbol', symbol);
  engineUrl.searchParams.set('timeframe', timeframe);
  engineUrl.searchParams.set('indicator', indicator);
  if (params) engineUrl.searchParams.set('params', params);
  if (limit)  engineUrl.searchParams.set('limit', limit);

  try {
    const res = await engineFetch(`/indicators/series${engineUrl.search}`);
    if (!res.ok) {
      return json(
        { error: 'engine_unavailable', cached: false },
        { status: 503 },
      );
    }
    const data: unknown = await res.json();
    return json(data);
  } catch {
    return json(
      { error: 'engine_unavailable', cached: false },
      { status: 503 },
    );
  }
};

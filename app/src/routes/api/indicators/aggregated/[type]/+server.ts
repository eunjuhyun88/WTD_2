// W-T5 — Aggregated indicator series proxy
//
// Proxies engine GET /indicators/aggregated/{type} to the client.
// Supported types: funding | oi | liq | vol | returns
//
// GET /api/indicators/aggregated/funding?symbol=BTCUSDT&limit=500
//   → { type: "funding", symbol: "BTCUSDT", points: [{t: ms, v: float}], count: int }
//
// Rate-limited to 60 req/min per IP.

import { json, error, type RequestHandler } from '@sveltejs/kit';
import { engineFetch } from '$lib/server/engineTransport';

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

setInterval(() => {
  const cutoff = Date.now() - RATE_WINDOW_MS * 2;
  for (const [key, val] of rateLimitMap.entries()) {
    if (val.windowStart < cutoff) rateLimitMap.delete(key);
  }
}, 5 * 60_000);

const SUPPORTED_TYPES = new Set(['funding', 'oi', 'liq', 'vol', 'returns']);

export const GET: RequestHandler = async ({ params, url, getClientAddress }) => {
  const ip = getClientAddress();
  if (!checkRateLimit(ip)) {
    return json({ error: 'rate_limit_exceeded' }, { status: 429 });
  }

  const type = params.type ?? '';
  if (!SUPPORTED_TYPES.has(type)) {
    return error(400, `Unknown aggregated type '${type}'. Supported: ${[...SUPPORTED_TYPES].join(', ')}`);
  }

  const symbol = (url.searchParams.get('symbol') ?? 'BTCUSDT').toUpperCase();
  const limit  = url.searchParams.get('limit');
  const period = url.searchParams.get('period');

  const engineParams = new URLSearchParams({ symbol });
  if (limit)  engineParams.set('limit', limit);
  if (period) engineParams.set('period', period);

  try {
    const res = await engineFetch(`/indicators/aggregated/${type}?${engineParams.toString()}`);
    if (!res.ok) {
      return json({ error: 'engine_unavailable', cached: false }, { status: 503 });
    }
    return json(await res.json());
  } catch {
    return json({ error: 'engine_unavailable', cached: false }, { status: 503 });
  }
};

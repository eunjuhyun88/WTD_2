/**
 * GET /api/chart/feed?symbol=BTCUSDT&tf=1h&limit=500
 *
 * Unified chart data endpoint — returns klines + OI + funding + liquidations
 * in a single request.  500 concurrent users share one Redis cache entry
 * per (symbol, tf) tuple, so external API call rate stays O(1) per 30s
 * regardless of connected user count.
 *
 * Cache hierarchy:
 *   L1  local Map (15 s) — per Vercel instance, zero latency
 *   L2  Upstash Redis (30 s) — shared across all instances
 *   L3  upstream APIs (Binance FAPI + Coinalyze) — only on cold miss
 *
 * Rate limit: 120 req/min per IP (same budget as /api/chart/klines).
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getChartSeries } from '$lib/server/chart/chartSeriesService';
import { chartFeedLimiter } from '$lib/server/rateLimit';

const VALID_SYMBOL = /^[A-Z0-9]{2,20}$/;
const VALID_TF = new Set(['1m','3m','5m','15m','30m','1h','2h','4h','6h','12h','1d','1w']);

export const GET: RequestHandler = async ({ url, fetch, getClientAddress }) => {
  if (!chartFeedLimiter.check(getClientAddress())) {
    return json({ error: 'Too many requests' }, {
      status: 429,
      headers: { 'Retry-After': '10' },
    });
  }

  const symbol = (url.searchParams.get('symbol') ?? 'BTCUSDT').toUpperCase();
  const tf     = (url.searchParams.get('tf') ?? '1h').toLowerCase();
  const limit  = Math.min(Number(url.searchParams.get('limit') ?? '500'), 1000);
  const emaTf  = url.searchParams.get('emaTf')?.trim() ?? '';

  if (!VALID_SYMBOL.test(symbol)) return json({ error: 'Invalid symbol' }, { status: 400 });
  if (!VALID_TF.has(tf))         return json({ error: 'Invalid tf' },     { status: 400 });

  try {
    const { payload, cacheStatus } = await getChartSeries({
      symbol, tf, limit, emaTf, fetchImpl: fetch,
    });

    return json(payload, {
      headers: {
        // L0: HTTP cache — CDN/browser can reuse for 15 s
        'cache-control': 'public, max-age=15, stale-while-revalidate=30',
        'x-cache': cacheStatus,
        'x-symbol': symbol,
        'x-tf': tf,
      },
    });
  } catch (err) {
    return json({ error: String(err) }, { status: 500 });
  }
};

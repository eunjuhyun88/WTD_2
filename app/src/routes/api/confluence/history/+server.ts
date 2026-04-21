/**
 * GET /api/confluence/history?symbol=BTCUSDT&limit=288
 *
 * Returns the in-memory ring buffer of recent confluence readings for a symbol.
 * Powers the sparkline and divergence-streak UI on the ConfluenceBanner.
 *
 * Source of truth is `pushConfluence()` inside `/api/confluence/current`, so
 * the history is only populated for symbols that have been queried during
 * this server lifetime. That's fine — a user seeing an empty sparkline on
 * first load is a correct "just starting" signal.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { chartFeedLimiter } from '$lib/server/rateLimit';
import { getConfluenceHistory, streakBack } from '$lib/server/confluenceHistory';

const VALID_SYMBOL = /^[A-Z0-9]{3,12}USDT$/;
const MAX_LIMIT = 288;

export const GET: RequestHandler = async ({ url, getClientAddress }) => {
  const symbol = (url.searchParams.get('symbol') ?? 'BTCUSDT').toUpperCase();
  if (!VALID_SYMBOL.test(symbol)) return json({ error: 'invalid symbol' }, { status: 400 });

  const ip = getClientAddress();
  if (!chartFeedLimiter.check(ip)) {
    return json({ error: 'rate limited' }, { status: 429, headers: { 'Retry-After': '30' } });
  }

  const limitParam = Number(url.searchParams.get('limit') ?? MAX_LIMIT);
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, MAX_LIMIT) : MAX_LIMIT;

  const entries = getConfluenceHistory(symbol, limit);
  const divergenceStreak = streakBack(symbol, e => e.divergence);
  const bullStreak = streakBack(symbol, e => e.regime === 'bull' || e.regime === 'strong_bull');
  const bearStreak = streakBack(symbol, e => e.regime === 'bear' || e.regime === 'strong_bear');

  return json({
    symbol,
    entries,
    count: entries.length,
    divergenceStreak,
    bullStreak,
    bearStreak,
    at: Date.now(),
  });
};

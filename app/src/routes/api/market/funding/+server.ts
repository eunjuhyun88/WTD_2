import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { terminalReadLimiter } from '$lib/server/rateLimit';

const VALID_SYMBOL = /^[A-Z0-9]{2,20}$/;

/**
 * GET /api/market/funding?symbol=BTCUSDT&limit=96
 *
 * Returns funding rate history from Binance Futures.
 * Mapped to OhlcvBar-compatible shape:
 *   delta = fundingRate  (positive = green bar, negative = red bar)
 *   c = fundingRate      (for any line-based fallback)
 *   v/bv/sv/cvd/o/h/l = 0
 *
 * Binance funding is settled every 8h; limit=96 → ~32 days
 */

const BINANCE_FAPI = 'https://fapi.binance.com';

export const GET: RequestHandler = async ({ url, getClientAddress }) => {
  if (!terminalReadLimiter.check(getClientAddress())) {
    return json({ error: 'Too many requests' }, { status: 429 });
  }
  const symbol = (url.searchParams.get('symbol') || 'BTCUSDT').toUpperCase();
  const limit = Math.min(Number(url.searchParams.get('limit') || '96'), 1000);
  if (!VALID_SYMBOL.test(symbol)) {
    return json({ error: 'Invalid symbol' }, { status: 400 });
  }

  try {
    const res = await fetch(
      `${BINANCE_FAPI}/fapi/v1/fundingRate?symbol=${symbol}&limit=${limit}`
    );
    if (!res.ok) {
      return json({ error: `Binance funding API error: ${res.status}` }, { status: res.status });
    }

    const raw: { symbol: string; fundingTime: number; fundingRate: string; markPrice: string }[] =
      await res.json();

    const bars = raw.map((d) => {
      const rate = parseFloat(d.fundingRate);
      return {
        t: d.fundingTime,
        o: 0, h: 0, l: 0, c: rate,
        v: 0, bv: 0, sv: 0,
        delta: rate,
        cvd: 0,
      };
    });

    return json(
      { symbol, bars },
      { headers: { 'Cache-Control': 'public, max-age=120' } }
    );
  } catch (err: any) {
    return json({ error: err.message || 'Failed to fetch funding rate history' }, { status: 502 });
  }
};

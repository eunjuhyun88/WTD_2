import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { terminalReadLimiter } from '$lib/server/rateLimit';

const VALID_SYMBOL = /^[A-Z0-9]{2,20}$/;

/**
 * GET /api/market/ohlcv?symbol=BTCUSDT&interval=1h&limit=100
 *
 * Returns OHLCV data with buy/sell volume delta and cumulative volume delta (CVD).
 * Uses Binance Futures API klines which include taker buy volume.
 *
 * Kline fields: [openTime, open, high, low, close, volume, closeTime,
 *                quoteVolume, trades, takerBuyBaseVolume, takerBuyQuoteVolume, ignore]
 */

const BINANCE_FAPI = 'https://fapi.binance.com';
const VALID_INTERVALS = ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '8h', '12h', '1d', '1w'];

export interface OhlcvBar {
  t: number;      // open time (ms)
  o: number;      // open
  h: number;      // high
  l: number;      // low
  c: number;      // close
  v: number;      // total volume
  bv: number;     // buy (taker) volume
  sv: number;     // sell volume (total - buy)
  delta: number;  // volume delta (buy - sell)
  cvd: number;    // cumulative volume delta
}

export const GET: RequestHandler = async ({ url, getClientAddress }) => {
  if (!terminalReadLimiter.check(getClientAddress())) {
    return json({ error: 'Too many requests' }, { status: 429 });
  }
  const symbol = (url.searchParams.get('symbol') || 'BTCUSDT').toUpperCase();
  const interval = url.searchParams.get('interval') || '1h';
  const limit = Math.min(Number(url.searchParams.get('limit') || '100'), 500);

  if (!VALID_SYMBOL.test(symbol)) {
    return json({ error: 'Invalid symbol' }, { status: 400 });
  }
  if (!VALID_INTERVALS.includes(interval)) {
    return json({ error: `Invalid interval. Use: ${VALID_INTERVALS.join(', ')}` }, { status: 400 });
  }

  try {
    const res = await fetch(
      `${BINANCE_FAPI}/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
    );
    if (!res.ok) {
      return json({ error: `Binance API error: ${res.status}` }, { status: res.status });
    }

    const raw: any[][] = await res.json();
    let cvd = 0;

    const bars: OhlcvBar[] = raw.map((k) => {
      const totalVol = parseFloat(k[5]);
      const buyVol = parseFloat(k[9]);   // taker buy base asset volume
      const sellVol = totalVol - buyVol;
      const delta = buyVol - sellVol;
      cvd += delta;

      return {
        t: k[0],
        o: parseFloat(k[1]),
        h: parseFloat(k[2]),
        l: parseFloat(k[3]),
        c: parseFloat(k[4]),
        v: totalVol,
        bv: buyVol,
        sv: sellVol,
        delta,
        cvd,
      };
    });

    return json(
      { symbol, interval, bars },
      { headers: { 'Cache-Control': 'public, max-age=60' } }
    );
  } catch (err: any) {
    console.error('[api/market/ohlcv] upstream error:', err);
    return json({ error: 'Failed to fetch OHLCV' }, { status: 502 });
  }
};

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * GET /api/market/oi?symbol=BTCUSDT&period=1h&limit=96
 *
 * Returns open interest history from Binance Futures.
 * Bars are mapped to OhlcvBar-compatible shape so MiniIndicatorChart
 * can render them without a new interface:
 *   c = sumOpenInterest (the primary value to plot)
 *   v = sumOpenInterest (for area fill)
 *   delta/cvd/bv/sv = 0
 */

const BINANCE_FDATA = 'https://fapi.binance.com/futures/data';
const VALID_PERIODS = ['5m', '15m', '30m', '1h', '2h', '4h', '6h', '12h', '1d'];

export const GET: RequestHandler = async ({ url }) => {
  const symbol = (url.searchParams.get('symbol') || 'BTCUSDT').toUpperCase();
  const period = url.searchParams.get('period') || '1h';
  const limit = Math.min(Number(url.searchParams.get('limit') || '96'), 500);

  if (!VALID_PERIODS.includes(period)) {
    return json({ error: `Invalid period. Use: ${VALID_PERIODS.join(', ')}` }, { status: 400 });
  }

  try {
    const res = await fetch(
      `${BINANCE_FDATA}/openInterestHist?symbol=${symbol}&period=${period}&limit=${limit}`
    );
    if (!res.ok) {
      return json({ error: `Binance OI API error: ${res.status}` }, { status: res.status });
    }

    const raw: { symbol: string; sumOpenInterest: string; sumOpenInterestValue: string; timestamp: number }[] =
      await res.json();

    const bars = raw.map((d) => {
      const oi = parseFloat(d.sumOpenInterest);
      return {
        t: d.timestamp,
        o: oi, h: oi, l: oi, c: oi,
        v: oi,
        bv: 0, sv: 0, delta: 0, cvd: 0,
      };
    });

    return json(
      { symbol, period, bars },
      { headers: { 'Cache-Control': 'public, max-age=60' } }
    );
  } catch (err: any) {
    return json({ error: err.message || 'Failed to fetch OI history' }, { status: 502 });
  }
};

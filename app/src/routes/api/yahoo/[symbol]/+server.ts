import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { analyzeTrend } from '$lib/engine/trend';
import { fetchYahooSeries } from '$lib/server/yahooFinance';

const RANGE_SET = new Set(['5d', '1mo', '3mo', '6mo', '1y', '2y', '5y', '10y', 'ytd', 'max']);
const INTERVAL_SET = new Set(['1d', '1wk', '1mo']);

function normalizeRange(value: string | null): string {
  const range = (value || '1mo').trim().toLowerCase();
  return RANGE_SET.has(range) ? range : '1mo';
}

function normalizeInterval(value: string | null): string {
  const interval = (value || '1d').trim().toLowerCase();
  return INTERVAL_SET.has(interval) ? interval : '1d';
}

export const GET: RequestHandler = async ({ params, url }) => {
  try {
    const rawSymbol = params.symbol ? decodeURIComponent(params.symbol) : '';
    if (!rawSymbol) return json({ error: 'symbol is required' }, { status: 400 });

    const range = normalizeRange(url.searchParams.get('range'));
    const interval = normalizeInterval(url.searchParams.get('interval'));
    const series = await fetchYahooSeries(rawSymbol, range, interval);

    if (!series || !series.points.length) {
      return json({ error: 'Yahoo source unavailable' }, { status: 502 });
    }

    const closes = series.points.map((row) => row.close);
    const trend = analyzeTrend(closes);
    const last = series.points[series.points.length - 1];

    const payload = {
      symbol: series.symbol,
      range,
      interval,
      latest: {
        close: last.close,
        timestampMs: last.timestampMs,
        previousClose: series.previousClose,
        regularMarketPrice: series.regularMarketPrice,
        regularMarketChangePercent: series.regularMarketChangePercent,
        updatedAt: series.updatedAt,
      },
      trend,
      points: series.points,
    };

    return json(
      {
        success: true,
        ok: true,
        symbol: payload.symbol,
        points: payload.points,
        data: payload,
      },
      {
        headers: {
          'Cache-Control': 'public, max-age=120',
        },
      }
    );
  } catch (error) {
    console.error('[yahoo/:symbol/get] unexpected error:', error);
    return json({ error: 'Failed to load yahoo data' }, { status: 500 });
  }
};

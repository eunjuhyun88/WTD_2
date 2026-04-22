import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getChartSeries } from '$lib/server/chart/chartSeriesService';
import { chartKlinesLimiter } from '$lib/server/rateLimit';
import { getRequestIp } from '$lib/server/requestIp';

export const GET: RequestHandler = async ({ url, fetch, request, getClientAddress }) => {
  const ip = getRequestIp({ request, getClientAddress });
  if (!chartKlinesLimiter.check(ip)) {
    return json({ error: 'Too many requests' }, { status: 429 });
  }
  const symbol    = url.searchParams.get('symbol') ?? 'BTCUSDT';
  const tf        = url.searchParams.get('tf') ?? '1h';
  const limit     = Math.min(parseInt(url.searchParams.get('limit') ?? '500'), 1000);
  const emaTf     = url.searchParams.get('emaTf')?.trim() ?? '';
  const stRaw     = url.searchParams.get('startTime');
  const startTime = stRaw ? parseInt(stRaw) : undefined;

  try {
    const { payload, cacheStatus } = await getChartSeries({
      symbol,
      tf,
      limit,
      emaTf,
      startTime,
      fetchImpl: fetch,
    });
    return json(payload, {
      headers: {
        'cache-control': 'private, max-age=15',
        'x-terminal-cache': cacheStatus,
      },
    });
  } catch (error) {
    return json({ error: String(error) }, { status: 500 });
  }
};

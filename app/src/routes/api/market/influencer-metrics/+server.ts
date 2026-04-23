import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { chartFeedLimiter } from '$lib/server/rateLimit';
import { getRequestIp } from '$lib/server/requestIp';
import { fetchInfluencerMetrics } from '$lib/server/influencerMetrics';

const VALID_SYMBOL = /^[A-Z0-9]{3,12}USDT$/;

export const GET: RequestHandler = async ({ url, request, getClientAddress }) => {
  const symbol = (url.searchParams.get('symbol') ?? 'BTCUSDT').toUpperCase();
  if (!VALID_SYMBOL.test(symbol)) {
    return json({ error: 'invalid symbol' }, { status: 400 });
  }

  const ip = getRequestIp({ request, getClientAddress });
  if (!chartFeedLimiter.check(ip)) {
    return json({ error: 'rate limited' }, { status: 429, headers: { 'Retry-After': '60' } });
  }

  try {
    const payload = await fetchInfluencerMetrics(symbol);
    return json(payload, {
      headers: {
        'Cache-Control': 'public, max-age=60',
      },
    });
  } catch (error) {
    console.error('[api/market/influencer-metrics] error:', error);
    return json({ error: 'failed to build influencer metrics pack' }, { status: 500 });
  }
};

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { terminalReadLimiter } from '$lib/server/rateLimit';
import { normalizePair, normalizeTimeframe } from '$lib/server/marketFeedService';
import { loadMarketFlow } from '$lib/server/marketFlow';

export const GET: RequestHandler = async ({ fetch, url, getClientAddress }) => {
  if (!terminalReadLimiter.check(getClientAddress())) {
    return json({ error: 'Too many requests' }, { status: 429 });
  }
  try {
    const pair = normalizePair(url.searchParams.get('pair'));
    const timeframe = normalizeTimeframe(url.searchParams.get('timeframe'));
    const result = await loadMarketFlow(fetch, { pair, timeframe });

    return json(
      {
        ok: true,
        data: result.data,
      },
      {
        headers: {
          'Cache-Control': 'public, max-age=15',
          'X-WTD-Plane': 'fact',
          'X-WTD-Upstream': result.headers.upstream,
          'X-WTD-State': result.headers.state,
        },
      }
    );
  } catch (error: any) {
    if (typeof error?.message === 'string' && error.message.includes('pair must be like')) {
      return json({ error: error.message }, { status: 400 });
    }
    if (typeof error?.message === 'string' && error.message.includes('timeframe must be one of')) {
      return json({ error: error.message }, { status: 400 });
    }
    console.error('[market/flow/get] unexpected error:', error);
    return json({ error: 'Failed to load flow data' }, { status: 500 });
  }
};

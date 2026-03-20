import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fetchDerivatives, normalizePair, normalizeTimeframe, pairToSlug } from '$lib/server/marketFeedService';

export const GET: RequestHandler = async ({ fetch, params, url }) => {
  try {
    const pairRaw = params.pair ? decodeURIComponent(params.pair) : '';
    const pair = normalizePair(pairRaw || url.searchParams.get('pair'));
    const timeframe = normalizeTimeframe(url.searchParams.get('timeframe'));

    const snapshot = await fetchDerivatives(fetch, pair, timeframe);

    return json(
      {
        ok: true,
        data: {
          ...snapshot,
          pairSlug: pairToSlug(pair),
        },
      },
      {
        headers: {
          'Cache-Control': 'public, max-age=15',
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
    console.error('[market/derivatives/:pair/get] unexpected error:', error);
    return json({ error: 'Failed to load derivatives snapshot' }, { status: 500 });
  }
};


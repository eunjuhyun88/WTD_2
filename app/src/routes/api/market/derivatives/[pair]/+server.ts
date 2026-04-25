import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fetchDerivatives, normalizePair, normalizeTimeframe, pairToSlug } from '$lib/server/marketFeedService';
import {
  fetchFactPerpContextProxy,
  type EngineFactPerpContextPayload,
} from '$lib/server/enginePlanes/facts';

function adaptEnginePerpContext(
  pair: string,
  timeframe: string,
  payload: EngineFactPerpContextPayload,
) {
  const updatedAt = Date.parse(payload.generated_at ?? '');
  return {
    pair,
    timeframe,
    oi: null,
    funding: payload.metrics?.funding_rate ?? null,
    predFunding: null,
    lsRatio: payload.metrics?.long_short_ratio ?? null,
    liqLong24h: null,
    liqShort24h: null,
    updatedAt: Number.isFinite(updatedAt) ? updatedAt : Date.now(),
  };
}

export const GET: RequestHandler = async ({ fetch, params, url }) => {
  try {
    const pairRaw = params.pair ? decodeURIComponent(params.pair) : '';
    const pair = normalizePair(pairRaw || url.searchParams.get('pair'));
    const timeframe = normalizeTimeframe(url.searchParams.get('timeframe'));
    const symbol = pair.replace('/', '');

    const enginePerp = await fetchFactPerpContextProxy(fetch, {
      symbol,
      timeframe,
      offline: true,
    }).catch(() => null);
    const snapshot = enginePerp
      ? adaptEnginePerpContext(pair, timeframe, enginePerp)
      : await fetchDerivatives(fetch, pair, timeframe);

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
          'X-WTD-Plane': 'fact',
          'X-WTD-Upstream': enginePerp ? 'facts/perp-context' : 'legacy-compute',
          'X-WTD-State': enginePerp ? 'adapter' : 'fallback',
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

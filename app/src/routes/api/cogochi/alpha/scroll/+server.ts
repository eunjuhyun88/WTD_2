/**
 * GET /api/cogochi/alpha/scroll
 *
 * BFF proxy → engine GET /alpha/scroll
 * Scroll segment analysis: indicator snapshot + anomaly flags + similar segments.
 *
 * Query params:
 *   symbol    — e.g. ETHUSDT (required)
 *   from_ts   — ISO8601 (required)
 *   to_ts     — ISO8601 (required)
 *   timeframe — "1h" | "4h" | "1d" (default "1h")
 *   top_k     — 1-20 (default 10)
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { engineFetch } from '$lib/server/engineTransport';

export const GET: RequestHandler = async ({ url }) => {
  const symbol = url.searchParams.get('symbol');
  const from_ts = url.searchParams.get('from_ts');
  const to_ts = url.searchParams.get('to_ts');

  if (!symbol || !from_ts || !to_ts) {
    return json({ error: 'symbol, from_ts, to_ts are required' }, { status: 400 });
  }

  const params = new URLSearchParams({ symbol, from_ts, to_ts });
  const timeframe = url.searchParams.get('timeframe');
  const top_k = url.searchParams.get('top_k');
  if (timeframe) params.set('timeframe', timeframe);
  if (top_k) params.set('top_k', top_k);

  try {
    const res = await engineFetch(`/alpha/scroll?${params}`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) throw new Error(`engine ${res.status}`);
    return json(await res.json());
  } catch (err) {
    return json(
      { segment: null, alpha_score: null, similar: { similar_segments: [], confidence: 'low' } },
      { status: 200 }
    );
  }
};

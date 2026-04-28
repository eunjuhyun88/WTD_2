// GET /api/patterns/transitions — lossless proxy for engine /patterns/transitions
// B4: Feeds transitions panel on /patterns dashboard and /patterns/[slug] detail page.

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { engineFetch } from '$lib/server/engineTransport';
import { terminalReadLimiter } from '$lib/server/rateLimit';

export const GET: RequestHandler = async ({ url, getClientAddress }) => {
  if (!terminalReadLimiter.check(getClientAddress())) {
    return json({ error: 'Too many requests' }, { status: 429 });
  }
  try {
    const params = new URLSearchParams();
    const limit = url.searchParams.get('limit');
    const symbol = url.searchParams.get('symbol');
    const slug = url.searchParams.get('slug');
    if (limit) params.set('limit', limit);
    if (symbol) params.set('symbol', symbol);
    if (slug) params.set('slug', slug);
    const qs = params.toString();
    const res = await engineFetch(`/patterns/transitions${qs ? `?${qs}` : ''}`);
    const body = await res.text();
    return new Response(body, {
      status: res.status,
      headers: {
        'content-type': res.headers.get('content-type') ?? 'application/json',
      },
    });
  } catch (err) {
    console.error('[api/patterns/transitions] engine error:', err);
    return json({ error: 'engine unavailable' }, { status: 503 });
  }
};

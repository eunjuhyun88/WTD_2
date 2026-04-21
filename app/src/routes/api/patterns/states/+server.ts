// GET /api/patterns/states — lossless proxy for engine /patterns/states

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { engineFetch } from '$lib/server/engineTransport';
import { terminalReadLimiter } from '$lib/server/rateLimit';

export const GET: RequestHandler = async ({ getClientAddress }) => {
  if (!terminalReadLimiter.check(getClientAddress())) {
    return json({ error: 'Too many requests' }, { status: 429 });
  }
  try {
    const res = await engineFetch('/patterns/states');
    const body = await res.text();
    return new Response(body, {
      status: res.status,
      headers: {
        'content-type': res.headers.get('content-type') ?? 'application/json',
      },
    });
  } catch (err) {
    console.error('[api/patterns/states] engine error:', err);
    return json({ error: 'engine unavailable' }, { status: 503 });
  }
};

// GET /api/patterns — lossless proxy for engine /patterns/candidates

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { engineFetch } from '$lib/server/engineTransport';
import { scanLimiterDistributed } from '$lib/server/distributedRateLimit';

export const GET: RequestHandler = async ({ getClientAddress }) => {
  if (!(await scanLimiterDistributed.check(getClientAddress()))) {
    return json({ error: 'Too many requests' }, { status: 429 });
  }
  try {
    const res = await engineFetch('/patterns/candidates');
    const body = await res.text();
    return new Response(body, {
      status: res.status,
      headers: {
        'content-type': res.headers.get('content-type') ?? 'application/json',
      },
    });
  } catch (err) {
    console.error('[api/patterns] engine error:', err);
    return json({ error: 'engine unavailable' }, { status: 503 });
  }
};

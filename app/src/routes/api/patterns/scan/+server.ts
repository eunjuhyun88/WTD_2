// POST /api/patterns/scan — triggers engine pattern scan
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { engineFetch } from '$lib/server/engineTransport';
import { scanLimiter } from '$lib/server/rateLimit';

export const POST: RequestHandler = async ({ getClientAddress }) => {
  if (!scanLimiter.check(getClientAddress())) {
    return json({ error: 'Too many requests' }, { status: 429 });
  }
  try {
    const res = await engineFetch('/patterns/scan', { method: 'POST' });
    const body = res.ok ? await res.json() : { status: 'error' };
    return json(body);
  } catch (err) {
    console.error('[api/patterns/scan] engine error:', err);
    return json({ error: 'engine unavailable' }, { status: 503 });
  }
};

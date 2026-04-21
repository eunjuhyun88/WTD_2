// GET /api/patterns — lossless proxy for engine /patterns/candidates

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { engineFetch } from '$lib/server/engineTransport';
import { scanLimiter } from '$lib/server/rateLimit';

export const GET: RequestHandler = async ({ getClientAddress }) => {
  if (!scanLimiter.check(getClientAddress())) {
    return json({ error: 'Too many requests' }, { status: 429 });
  }
  try {
    const res = await engineFetch('/patterns/candidates');
    if (!res.ok) return json({ entry_candidates: {}, total_count: 0, ok: false });

    const data = await res.json();
    return json({ ...data, ok: true });
  } catch (err) {
    console.error('[api/patterns] engine error:', err);
    return json({ entry_candidates: {}, total_count: 0, ok: false, error: 'engine unavailable' });
  }
};

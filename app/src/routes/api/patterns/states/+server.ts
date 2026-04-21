// GET /api/patterns/states — lossless proxy for engine /patterns/states

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { terminalReadLimiter } from '$lib/server/rateLimit';

const ENGINE_URL = (env.ENGINE_URL ?? 'http://localhost:8000').replace(/\/$/, '');

export const GET: RequestHandler = async ({ getClientAddress }) => {
  if (!terminalReadLimiter.check(getClientAddress())) {
    return json({ error: 'Too many requests' }, { status: 429 });
  }
  try {
    const res = await fetch(`${ENGINE_URL}/patterns/states`);
    if (!res.ok) return json({ patterns: {}, ok: false });

    const data = await res.json();
    return json({ ...data, ok: true });
  } catch (err) {
    console.error('[api/patterns/states] engine error:', err);
    return json({ patterns: {}, ok: false, error: 'engine unavailable' });
  }
};

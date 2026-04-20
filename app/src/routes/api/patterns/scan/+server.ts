// POST /api/patterns/scan — triggers engine pattern scan
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { scanLimiter } from '$lib/server/rateLimit';

const ENGINE_URL = (env.ENGINE_URL ?? 'http://localhost:8000').replace(/\/$/, '');

export const POST: RequestHandler = async ({ getClientAddress }) => {
  if (!scanLimiter.check(getClientAddress())) {
    return json({ error: 'Too many requests' }, { status: 429 });
  }
  try {
    const res = await fetch(`${ENGINE_URL}/patterns/scan`, { method: 'POST' });
    const body = res.ok ? await res.json() : { status: 'error' };
    return json(body);
  } catch (err) {
    return json({ error: String(err) }, { status: 503 });
  }
};

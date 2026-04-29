/**
 * GET /api/patterns/lifecycle
 *
 * W-0318 — lifecycle list proxy.
 * Proxies engine GET /patterns/lifecycle.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { engineFetch } from '$lib/server/engineTransport';

export const GET: RequestHandler = async () => {
  try {
    const res = await engineFetch('/patterns/lifecycle', {
      signal: AbortSignal.timeout(5000),
    });
    const text = await res.text();
    return new Response(text, {
      status: res.status,
      headers: { 'content-type': res.headers.get('content-type') ?? 'application/json' },
    });
  } catch (err) {
    console.error('[api/patterns/lifecycle]', err);
    return json({ ok: false, count: 0, entries: [], error: 'engine unavailable' }, { status: 503 });
  }
};

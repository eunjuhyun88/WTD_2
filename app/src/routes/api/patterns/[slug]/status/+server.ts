/**
 * PATCH /api/patterns/[slug]/status
 *
 * W-0308 F-14 — Pattern lifecycle transition proxy.
 * Proxies engine PATCH /patterns/{slug}/status.
 * Body: { status: string, reason?: string }
 * Returns: { ok, slug, from_status, to_status, updated_at }
 * Engine returns 422 on invalid transitions.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { engineFetch } from '$lib/server/engineTransport';

export const PATCH: RequestHandler = async ({ request, params }) => {
  try {
    const body = await request.json() as { status?: string; reason?: string };
    if (!body.status) {
      return json({ ok: false, error: 'status is required' }, { status: 400 });
    }
    const res = await engineFetch(`/patterns/${encodeURIComponent(params.slug)}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: body.status, reason: body.reason ?? '' }),
      signal: AbortSignal.timeout(8000),
    });
    const text = await res.text();
    return new Response(text, {
      status: res.status,
      headers: { 'content-type': res.headers.get('content-type') ?? 'application/json' },
    });
  } catch (err) {
    console.error('[api/patterns/[slug]/status PATCH]', err);
    return json({ ok: false, error: 'engine unavailable' }, { status: 503 });
  }
};

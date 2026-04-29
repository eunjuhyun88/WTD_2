/**
 * GET /api/patterns/[slug]/lifecycle-status
 *
 * W-0308 F-14 — Pattern lifecycle status proxy.
 * Proxies engine GET /patterns/{slug}/lifecycle-status.
 * Returns { ok, slug, status } where status ∈ {draft, candidate, object, archived}.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { engineFetch } from '$lib/server/engineTransport';

export const GET: RequestHandler = async ({ params }) => {
  try {
    const res = await engineFetch(`/patterns/${encodeURIComponent(params.slug)}/lifecycle-status`, {
      signal: AbortSignal.timeout(5000),
    });
    const text = await res.text();
    return new Response(text, {
      status: res.status,
      headers: { 'content-type': res.headers.get('content-type') ?? 'application/json' },
    });
  } catch (err) {
    console.error('[api/patterns/[slug]/lifecycle-status]', err);
    return json({ ok: true, slug: params.slug, status: 'draft' }, { status: 200 });
  }
};

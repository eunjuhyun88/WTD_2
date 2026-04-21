// POST /api/patterns/[slug]/verdict
// Legacy compatibility shim.
// Canonical verdicting now requires capture_id and forwards to /captures/{id}/verdict.

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { engineFetch } from '$lib/server/engineTransport';

export const POST: RequestHandler = async ({ request, params }) => {
  try {
    const body = await request.json() as Record<string, unknown>;
    const captureId = typeof body.capture_id === 'string' ? body.capture_id.trim() : '';
    const verdict = body.verdict ?? body.user_verdict;
    if (!captureId) {
      return json(
        {
          error: 'Legacy symbol-based verdict writes are no longer supported. Use capture_id with /api/captures/{id}/verdict.',
          pattern_slug: params.slug,
        },
        { status: 400 },
      );
    }
    const res = await engineFetch(`/captures/${captureId}/verdict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        verdict,
        user_note: body.user_note ?? null,
      }),
    });

    const text = await res.text();
    return new Response(text, {
      status: res.status,
      headers: {
        'content-type': res.headers.get('content-type') ?? 'application/json',
      },
    });
  } catch (err) {
    console.error('[api/patterns/[slug]/verdict] engine error:', err);
    return json({ ok: false, error: 'engine unavailable' }, { status: 503 });
  }
};

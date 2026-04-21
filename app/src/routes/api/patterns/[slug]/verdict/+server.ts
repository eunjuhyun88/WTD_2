// POST /api/patterns/[slug]/verdict
// Body: { symbol: string, verdict: 'valid' | 'invalid' | 'missed' }
// Proxies to engine POST /patterns/{slug}/verdict

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { engineFetch } from '$lib/server/engineTransport';

export const POST: RequestHandler = async ({ request, params }) => {
  try {
    const body = await request.json();
    const res = await engineFetch(`/patterns/${params.slug}/verdict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      return json({ ok: false, error: err }, { status: res.status });
    }

    return json(await res.json());
  } catch (err) {
    console.error('[api/patterns/[slug]/verdict] engine error:', err);
    return json({ ok: false, error: 'engine unavailable' }, { status: 503 });
  }
};

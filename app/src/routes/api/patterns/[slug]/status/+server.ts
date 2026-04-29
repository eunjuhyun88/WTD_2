// PATCH /api/patterns/[slug]/status — proxy to engine lifecycle endpoint
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { engineFetch } from '$lib/server/engineTransport';

export const PATCH: RequestHandler = async ({ params, request }) => {
  const body = await request.json();
  try {
    const res = await engineFetch(`/patterns/${params.slug}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return json(data, { status: res.status });
  } catch (err) {
    console.error('[api/patterns/status] engine error:', err);
    return json({ error: 'engine unavailable' }, { status: 503 });
  }
};

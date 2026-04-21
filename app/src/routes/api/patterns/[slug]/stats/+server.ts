// GET /api/patterns/[slug]/stats
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { engineFetch } from '$lib/server/engineTransport';

export const GET: RequestHandler = async ({ params }) => {
  try {
    const res = await engineFetch(`/patterns/${params.slug}/stats`);
    if (!res.ok) return json({ error: `Engine ${res.status}` }, { status: res.status });
    return json(await res.json());
  } catch (err) {
    console.error('[api/patterns/[slug]/stats] engine error:', err);
    return json({ error: 'engine unavailable' }, { status: 503 });
  }
};

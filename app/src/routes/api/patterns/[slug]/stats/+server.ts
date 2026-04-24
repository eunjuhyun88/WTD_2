// GET /api/patterns/[slug]/stats
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { engineFetch } from '$lib/server/engineTransport';

export const GET: RequestHandler = async ({ params, url }) => {
  try {
    const query = new URLSearchParams();
    const definitionId = url.searchParams.get('definition_id');
    const definitionScope = url.searchParams.get('definition_scope');
    if (definitionId) {
      query.set('definition_id', definitionId);
    }
    if (definitionScope) {
      query.set('definition_scope', definitionScope);
    }
    const suffix = query.toString();
    const res = await engineFetch(`/patterns/${params.slug}/stats${suffix ? `?${suffix}` : ''}`);
    if (!res.ok) return json({ error: `Engine ${res.status}` }, { status: res.status });
    return json(await res.json());
  } catch (err) {
    console.error('[api/patterns/[slug]/stats] engine error:', err);
    return json({ error: 'engine unavailable' }, { status: 503 });
  }
};

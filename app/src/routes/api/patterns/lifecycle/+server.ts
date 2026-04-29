// GET /api/patterns/lifecycle — list all patterns with lifecycle status
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { engineFetch } from '$lib/server/engineTransport';

export const GET: RequestHandler = async ({ url }) => {
  try {
    const status = url.searchParams.get('status');
    const query = status ? `?status=${encodeURIComponent(status)}` : '';
    const res = await engineFetch(`/patterns/lifecycle${query}`);
    const data = await res.json();
    return json(data, { status: res.status });
  } catch (err) {
    console.error('[api/patterns/lifecycle] engine error:', err);
    return json({ error: 'engine unavailable' }, { status: 503 });
  }
};

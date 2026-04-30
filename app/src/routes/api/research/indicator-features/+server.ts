// GET /api/research/indicator-features
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { engineFetch } from '$lib/server/engineTransport';

export const GET: RequestHandler = async () => {
  try {
    const res = await engineFetch('/research/indicator-features');
    if (!res.ok) return json({}, { status: res.status });
    return json(await res.json());
  } catch (err) {
    console.error('[api/research/indicator-features] engine error:', err);
    return json({}, { status: 503 });
  }
};

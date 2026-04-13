// GET /api/patterns/[slug]/stats
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

const ENGINE_URL = (env.ENGINE_URL ?? 'http://localhost:8000').replace(/\/$/, '');

export const GET: RequestHandler = async ({ params }) => {
  try {
    const res = await fetch(`${ENGINE_URL}/patterns/${params.slug}/stats`);
    if (!res.ok) return json({ error: `Engine ${res.status}` }, { status: res.status });
    return json(await res.json());
  } catch (err) {
    return json({ error: String(err) }, { status: 503 });
  }
};

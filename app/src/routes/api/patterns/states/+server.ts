// GET /api/patterns/states — lossless proxy for engine /patterns/states

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

const ENGINE_URL = (env.ENGINE_URL ?? 'http://localhost:8000').replace(/\/$/, '');

export const GET: RequestHandler = async () => {
  try {
    const res = await fetch(`${ENGINE_URL}/patterns/states`);
    if (!res.ok) return json({ patterns: {}, ok: false });

    const data = await res.json();
    return json({ ...data, ok: true });
  } catch (err) {
    return json({ patterns: {}, ok: false, error: String(err) });
  }
};

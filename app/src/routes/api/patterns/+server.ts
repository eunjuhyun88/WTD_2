// GET /api/patterns — proxies to engine GET /patterns/states + /patterns/candidates
// Returns combined data for the frontend

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

const ENGINE_URL = (env.ENGINE_URL ?? 'http://localhost:8000').replace(/\/$/, '');

export const GET: RequestHandler = async () => {
  try {
    const [statesRes, candidatesRes] = await Promise.all([
      fetch(`${ENGINE_URL}/patterns/states`),
      fetch(`${ENGINE_URL}/patterns/candidates`),
    ]);

    const states = statesRes.ok ? await statesRes.json() : { patterns: {} };
    const candidates = candidatesRes.ok ? await candidatesRes.json() : { entry_candidates: {} };

    return json({
      patterns: states.patterns ?? {},
      entry_candidates: candidates.entry_candidates ?? {},
      ok: true,
    });
  } catch (err) {
    // Engine down — return empty
    return json({ patterns: {}, entry_candidates: {}, ok: false, error: String(err) });
  }
};

/**
 * GET /api/cogochi/alpha/world-model
 *
 * Proxy to engine GET /alpha/world-model.
 * Returns current phase state for all Alpha Universe tokens.
 *
 * Query params:
 *   grade — 'A' | 'B' | 'all' (optional)
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { engineFetch } from '$lib/server/engineTransport';

export const GET: RequestHandler = async ({ url }) => {
  const grade = url.searchParams.get('grade');
  const params = grade ? `?grade=${grade}` : '';

  try {
    const res = await engineFetch(`/alpha/world-model${params}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`engine ${res.status}`);
    return json(await res.json());
  } catch {
    return json({ phases: [], phase_counts: {}, n_symbols: 0 }, { status: 200 });
  }
};

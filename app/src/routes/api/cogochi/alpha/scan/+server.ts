/**
 * GET /api/cogochi/alpha/scan
 *
 * BFF proxy → engine GET /alpha/scan
 * Composite alpha scores for a list of symbols or the full universe.
 *
 * Query params:
 *   symbols  — comma-separated, e.g. "ETHUSDT,BTCUSDT"
 *   universe — "all" for full 3-source alpha universe
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { engineFetch } from '$lib/server/engineTransport';

export const GET: RequestHandler = async ({ url }) => {
  const symbols = url.searchParams.get('symbols');
  const universe = url.searchParams.get('universe');

  if (!symbols && !universe) {
    return json({ error: 'Provide ?symbols= or ?universe=all' }, { status: 400 });
  }

  const params = new URLSearchParams();
  if (symbols) params.set('symbols', symbols);
  if (universe) params.set('universe', universe);

  try {
    const res = await engineFetch(`/alpha/scan?${params}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`engine ${res.status}`);
    return json(await res.json());
  } catch {
    return json({ scores: [], universe_size: 0, returned: 0 }, { status: 200 });
  }
};

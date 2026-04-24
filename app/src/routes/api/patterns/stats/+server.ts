// GET /api/patterns/stats
// Returns: { stats: PatternStats[] }
// Fetches library (to get all slugs), then per-slug stats in parallel.
// Field mapping: delegated to typed adapter — see $lib/types/patternStats.ts

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { engineFetch } from '$lib/server/engineTransport';
import { scanLimiter } from '$lib/server/rateLimit';
import { adaptEngineStats } from '$lib/types/patternStats';

export const GET: RequestHandler = async ({ getClientAddress, url }) => {
  if (!scanLimiter.check(getClientAddress())) {
    return json({ error: 'Too many requests' }, { status: 429 });
  }
  const t0 = performance.now();
  try {
    const params = new URLSearchParams();
    const definitionScope = url.searchParams.get('definition_scope');
    if (definitionScope) {
      params.set('definition_scope', definitionScope);
    }
    const query = params.toString();
    const res = await engineFetch(`/patterns/stats/all${query ? `?${query}` : ''}`);
    const engineMs = res.headers.get('x-process-time-ms');
    if (!res.ok) return json({ stats: [], ok: false });

    const body = await res.json() as {
      patterns?: Record<string, Record<string, unknown>>;
    };

    const stats = Object.entries(body.patterns ?? {})
      .filter(([, raw]) => !('error' in raw))
      .map(([slug, raw]) => adaptEngineStats(raw, slug));

    const totalMs = Math.round(performance.now() - t0);
    console.info(`[api/patterns/stats] ${stats.length} patterns total=${totalMs}ms engine=${engineMs ?? '?'}ms`);
    return json({ stats, ok: true });
  } catch (err) {
    const totalMs = Math.round(performance.now() - t0);
    console.error(`[api/patterns/stats] engine error after ${totalMs}ms:`, err);
    return json({ stats: [], ok: false, error: 'engine unavailable' });
  }
};

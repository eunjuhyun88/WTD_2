// GET /api/patterns/stats
// Returns: { stats: PatternStats[] }
// Fetches library (to get all slugs), then per-slug stats in parallel.
// Field mapping: delegated to typed adapter — see $lib/types/patternStats.ts

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { engineFetch } from '$lib/server/engineTransport';
import { scanLimiter } from '$lib/server/rateLimit';
import { adaptEngineStats } from '$lib/types/patternStats';

export const GET: RequestHandler = async ({ getClientAddress }) => {
  if (!scanLimiter.check(getClientAddress())) {
    return json({ error: 'Too many requests' }, { status: 429 });
  }
  try {
    const res = await engineFetch('/patterns/stats/all');
    if (!res.ok) return json({ stats: [], ok: false });

    const body = await res.json() as {
      patterns?: Record<string, Record<string, unknown>>;
    };

    const stats = Object.entries(body.patterns ?? {})
      .filter(([, raw]) => !('error' in raw))
      .map(([slug, raw]) => adaptEngineStats(raw, slug));

    return json({ stats, ok: true });
  } catch (err) {
    console.error('[api/patterns/stats] engine error:', err);
    return json({ stats: [], ok: false, error: 'engine unavailable' });
  }
};

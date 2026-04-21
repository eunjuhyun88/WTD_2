// GET /api/patterns/stats
// Returns: { stats: PatternStats[] }
// Fetches library (to get all slugs), then per-slug stats in parallel.
// Field mapping: delegated to typed adapter — see $lib/types/patternStats.ts

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { scanLimiter } from '$lib/server/rateLimit';
import { adaptEngineStats } from '$lib/types/patternStats';

const ENGINE_URL = (env.ENGINE_URL ?? 'http://localhost:8000').replace(/\/$/, '');

export const GET: RequestHandler = async ({ getClientAddress }) => {
  if (!scanLimiter.check(getClientAddress())) {
    return json({ error: 'Too many requests' }, { status: 429 });
  }
  try {
    // 1. Get all pattern slugs from library
    const libRes = await fetch(`${ENGINE_URL}/patterns/library`);
    if (!libRes.ok) return json({ stats: [], ok: false });
    const libData: { patterns: Array<{ slug: string }> } = await libRes.json();
    const slugs = (libData.patterns ?? []).map(p => p.slug);

    // 2. Fetch stats for each slug in parallel
    const statsResults = await Promise.allSettled(
      slugs.map(slug => fetch(`${ENGINE_URL}/patterns/${slug}/stats`))
    );

    const stats = [];
    for (let i = 0; i < slugs.length; i++) {
      const result = statsResults[i];
      if (result.status !== 'fulfilled' || !result.value.ok) continue;

      const raw = await result.value.json();
      stats.push(adaptEngineStats(raw, slugs[i]));
    }

    return json({ stats, ok: true });
  } catch (err) {
    console.error('[api/patterns/stats] engine error:', err);
    return json({ stats: [], ok: false, error: 'engine unavailable' });
  }
};

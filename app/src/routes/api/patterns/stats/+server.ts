// GET /api/patterns/stats
// Returns: { stats: PatternStats[] }
// Fetches library (to get all slugs), then per-slug stats in parallel

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

const ENGINE_URL = (env.ENGINE_URL ?? 'http://localhost:8000').replace(/\/$/, '');

export const GET: RequestHandler = async () => {
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
      // Normalize engine field names → page field names
      stats.push({
        pattern_slug:    raw.pattern_slug ?? slugs[i],
        total_instances: raw.total        ?? 0,
        success_count:   raw.success      ?? 0,
        failure_count:   raw.failure      ?? 0,
        pending_count:   raw.pending      ?? 0,
        hit_rate:        raw.success_rate ?? null,
        avg_gain_pct:    raw.avg_gain_pct ?? null,
        avg_loss_pct:    raw.avg_loss_pct ?? null,
        expected_value:  raw.expected_value ?? null,
        btc_conditional: raw.btc_conditional ?? null,
        decay_direction: raw.decay_direction ?? null,
        recent_30d_count: raw.recent_30d_count ?? 0,
        recent_30d_success_rate: raw.recent_30d_success_rate ?? null,
        ml_shadow: raw.ml_shadow ?? null,
      });
    }

    return json({ stats, ok: true });
  } catch (err) {
    return json({ stats: [], ok: false, error: String(err) });
  }
};

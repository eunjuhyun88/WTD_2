// GET /api/patterns/states
// Returns: { states: { symbol: { pattern_id: { current_phase, phase_name, entered_at, candles_in_phase } } } }

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

const ENGINE_URL = (env.ENGINE_URL ?? 'http://localhost:8000').replace(/\/$/, '');

export const GET: RequestHandler = async () => {
  try {
    const res = await fetch(`${ENGINE_URL}/patterns/states`);
    if (!res.ok) return json({ states: {}, ok: false });

    // Engine returns: { patterns: { slug: { sym: { phase_id, phase_idx, entered_at, bars_in_phase } } } }
    const data: { patterns: Record<string, Record<string, any>> } = await res.json();
    const patternsData = data.patterns ?? {};

    // Transform: slug → sym → richState  →  sym → slug → { current_phase, phase_name, entered_at, candles_in_phase }
    const states: Record<string, Record<string, any>> = {};

    for (const [slug, symMap] of Object.entries(patternsData)) {
      for (const [sym, richState] of Object.entries(symMap)) {
        if (!states[sym]) states[sym] = {};
        states[sym][slug] = {
          current_phase:    richState.phase_idx  ?? 0,
          phase_name:       richState.phase_id   ?? 'UNKNOWN',
          entered_at:       richState.entered_at ?? new Date().toISOString(),
          candles_in_phase: richState.bars_in_phase ?? 0,
        };
      }
    }

    return json({ states, ok: true });
  } catch (err) {
    return json({ states: {}, ok: false, error: String(err) });
  }
};

// GET /api/patterns — returns entry candidates across all patterns
// Format: { candidates: Candidate[], last_scan: string | null }
// Candidate: { symbol, pattern_id, phase, phase_name, since, features }

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

const ENGINE_URL = (env.ENGINE_URL ?? 'http://localhost:8000').replace(/\/$/, '');

const ENTRY_PHASE_INFO: Record<string, { phase_idx: number; phase_name: string }> = {
  'tradoor-oi-reversal-v1': { phase_idx: 3, phase_name: 'ACCUMULATION' },
};
const DEFAULT_PHASE = { phase_idx: 3, phase_name: 'ACCUMULATION' };

export const GET: RequestHandler = async () => {
  try {
    const res = await fetch(`${ENGINE_URL}/patterns/candidates`);
    if (!res.ok) return json({ candidates: [], last_scan: null, ok: false });

    const data: { entry_candidates: Record<string, string[]> } = await res.json();
    const entry_candidates = data.entry_candidates ?? {};

    // Flatten to Candidate[]
    const candidates = Object.entries(entry_candidates).flatMap(([slug, symbols]) => {
      const { phase_idx, phase_name } = ENTRY_PHASE_INFO[slug] ?? DEFAULT_PHASE;
      return (symbols as string[]).map(symbol => ({
        symbol,
        pattern_id: slug,
        phase:      phase_idx,
        phase_name,
        since:      new Date().toISOString(), // state machine doesn't expose entry time via this endpoint
        features:   {},
      }));
    });

    return json({ candidates, last_scan: null, ok: true });
  } catch (err) {
    return json({ candidates: [], last_scan: null, ok: false, error: String(err) });
  }
};

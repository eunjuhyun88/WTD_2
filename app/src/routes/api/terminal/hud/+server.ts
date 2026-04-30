/**
 * GET /api/terminal/hud?capture_id=<uuid>
 *
 * Returns Decision HUD payload for a given capture:
 *   - pattern_status: current phase + state machine state
 *   - evidence: similar captures from search (top 3)
 *   - risk: entry_p_win + threshold + btc_trend
 *   - transition: next phase conditions
 *   - actions: available 1-click actions
 *
 * TODO(W-0237): Wire to engine endpoints:
 *   - GET /runtime/captures/{id}                     → pattern_status
 *   - POST /search/similar { capture_id }            → evidence
 *   - GET /runtime/captures/{id}/risk-assessment     → risk
 *   - GET /runtime/captures/{id}/transitions         → transition
 * Currently returns mock data so the UI can be built and tested.
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import type { HudPayload } from '$lib/components/terminal/hud/types';

export const config = {
  runtime: 'nodejs22.x',
  regions: ['iad1'],
  memory: 256,
  maxDuration: 10,
};

export const GET: RequestHandler = async ({ url, cookies }) => {
  const user = await getAuthUserFromCookies(cookies);
  if (!user) throw error(401, 'Authentication required');

  const captureId = url.searchParams.get('capture_id');
  if (!captureId) throw error(400, 'capture_id is required');

  // TODO(W-0237): Replace mock data with real engine calls.
  // Engine integration points:
  //   const captureRes = await engineFetch(`/runtime/captures/${captureId}`, { signal: AbortSignal.timeout(5000) });
  //   const similarRes = await engineFetch('/search/similar', { method: 'POST', body: JSON.stringify({ capture_id: captureId, top_k: 3 }) });
  //   const riskRes = await engineFetch(`/runtime/captures/${captureId}/risk-assessment`);
  //   const transitionRes = await engineFetch(`/runtime/captures/${captureId}/transitions`);

  const payload: HudPayload = {
    pattern_status: {
      phase: 'ACCUMULATION',
      state: 'WATCHING',
      pattern_name: 'bull_flag',
      last_updated: new Date().toISOString(),
    },
    evidence: {
      similar_captures: [
        { capture_id: 'mock-cap-001', similarity: 0.92, outcome: 'win' },
        { capture_id: 'mock-cap-002', similarity: 0.87, outcome: 'win' },
        { capture_id: 'mock-cap-003', similarity: 0.81, outcome: 'loss' },
      ],
      count: 3,
    },
    risk: {
      entry_p_win: 0.68,
      threshold: 0.60,
      btc_trend: 'UP',
    },
    transition: {
      next_phase: 'MARKUP',
      conditions: [
        'Volume spike > 1.5x 20-bar avg',
        'Break above resistance zone',
        'BTC trend remains UP or NEUTRAL',
      ],
    },
    actions: {
      can_capture: true,
      can_watch: true,
      can_verdict: false,
      capture_id: captureId,
    },
  };

  return json({ ok: true, data: payload });
};

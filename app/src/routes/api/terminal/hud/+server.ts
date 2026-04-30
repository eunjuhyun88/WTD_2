/**
 * GET /api/terminal/hud?capture_id=<uuid>
 *
 * Returns Decision HUD payload for a given capture.
 * W-0309: mock → engine 실제 데이터 연결
 *
 * Data sources (실존 엔드포인트만 사용):
 *   GET /captures/{id}               → pattern_status + risk.p_win
 *   GET /captures?pattern_slug=&...  → evidence (same pattern, same symbol)
 *
 * Fallback: engine 5s timeout 시 mock 반환 (UX 보호)
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { engineFetch } from '$lib/server/engineTransport';
import type { HudPayload, HudSimilarCapture } from '$lib/components/terminal/hud/types';

export const config = {
  runtime: 'nodejs22.x',
  regions: ['iad1'],
  memory: 256,
  maxDuration: 10,
};

const NEXT_PHASE_MAP: Record<string, string> = {
  ACCUMULATION: 'MARKUP',
  MARKUP: 'DISTRIBUTION',
  DISTRIBUTION: 'MARKDOWN',
  MARKDOWN: 'ACCUMULATION',
  DUMP: 'ACCUMULATION',
  PUMP: 'DISTRIBUTION',
};

const PHASE_CONDITIONS: Record<string, string[]> = {
  ACCUMULATION: [
    'Volume spike > 1.5× 20-bar avg',
    'Break above resistance zone',
    'BTC trend remains UP or NEUTRAL',
  ],
  MARKUP: [
    'Resistance becomes support (retest)',
    'Higher highs + higher lows confirmed',
    'OI rising with price',
  ],
  DISTRIBUTION: [
    'Volume divergence (price up, vol down)',
    'Funding rate positive extreme',
    'Lower high formation',
  ],
  MARKDOWN: [
    'Support breach on volume',
    'BTC correlation breaks down',
    'Funding rate goes negative',
  ],
};

function buildMockPayload(captureId: string): HudPayload {
  return {
    pattern_status: { phase: 'UNKNOWN', state: 'PENDING', pattern_name: 'unknown', last_updated: new Date().toISOString() },
    evidence: { similar_captures: [], count: 0 },
    risk: { entry_p_win: null, threshold: 0.60, btc_trend: null },
    transition: { next_phase: null, conditions: [] },
    actions: { can_capture: true, can_watch: true, can_verdict: false, capture_id: captureId },
  };
}

export const GET: RequestHandler = async ({ url, cookies }) => {
  const user = await getAuthUserFromCookies(cookies);
  if (!user) throw error(401, 'Authentication required');

  const captureId = url.searchParams.get('capture_id');
  if (!captureId) throw error(400, 'capture_id is required');

  // ── 1. Fetch capture from engine ──────────────────────────────────────────
  let capture: Record<string, unknown> | null = null;
  try {
    const res = await engineFetch(`/captures/${encodeURIComponent(captureId)}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const body = await res.json() as Record<string, unknown>;
      capture = (body.capture ?? null) as Record<string, unknown> | null;
    }
  } catch {
    // timeout or engine down → fallback
  }

  if (!capture) {
    return json({ ok: true, data: buildMockPayload(captureId), source: 'mock' });
  }

  const phase = (capture.phase as string | undefined) ?? 'UNKNOWN';
  const patternSlug = (capture.pattern_slug as string | undefined) ?? 'unknown';
  const status = (capture.status as string | undefined) ?? 'pending_outcome';
  const chartCtx = (capture.chart_context as Record<string, unknown> | undefined) ?? {};
  const pWin = typeof chartCtx.p_win === 'number' ? chartCtx.p_win : null;
  const btcTrendRaw = String(chartCtx.btc_trend ?? '');
  const btcTrend = (['UP', 'DOWN', 'NEUTRAL'].includes(btcTrendRaw.toUpperCase())
    ? btcTrendRaw.toUpperCase()
    : null) as 'UP' | 'DOWN' | 'NEUTRAL' | null;
  const symbol = (capture.symbol as string | undefined) ?? '';
  const isWatching = Boolean(capture.is_watching);
  const hasVerdict = Boolean(capture.verdict_id);

  // ── 2. Fetch similar past captures (same pattern + symbol, limit 5) ───────
  let similarCaptures: HudSimilarCapture[] = [];
  try {
    const params = new URLSearchParams({ pattern_slug: patternSlug, symbol, limit: '5' });
    const res = await engineFetch(`/captures?${params}`, {
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) {
      const body = await res.json() as Record<string, unknown>;
      const list = Array.isArray(body.captures) ? body.captures as Record<string, unknown>[] : [];
      similarCaptures = list
        .filter(c => c.capture_id !== captureId)
        .slice(0, 3)
        .map(c => ({
          capture_id: String(c.capture_id ?? ''),
          similarity: 1.0,
          outcome: c.verdict_id ? 'judged' : 'pending',
        }));
    }
  } catch {
    // non-critical — evidence card shows empty
  }

  // ── 3. Build HudPayload ───────────────────────────────────────────────────
  const phaseKey = phase.toUpperCase();
  const nextPhase = NEXT_PHASE_MAP[phaseKey] ?? null;
  const conditions = PHASE_CONDITIONS[phaseKey] ?? [];

  const payload: HudPayload = {
    pattern_status: {
      phase,
      state: isWatching ? 'WATCHING' : status.replace(/_/g, ' ').toUpperCase(),
      pattern_name: patternSlug,
      last_updated: new Date().toISOString(),
    },
    evidence: {
      similar_captures: similarCaptures,
      count: similarCaptures.length,
    },
    risk: {
      entry_p_win: pWin,
      threshold: 0.60,
      btc_trend: btcTrend,
    },
    transition: {
      next_phase: nextPhase,
      conditions,
    },
    actions: {
      can_capture: !isWatching && status === 'pending_outcome',
      can_watch: !isWatching,
      can_verdict: hasVerdict || status === 'outcome_ready',
      capture_id: captureId,
    },
  };

  return json({ ok: true, data: payload, source: 'engine' });
};

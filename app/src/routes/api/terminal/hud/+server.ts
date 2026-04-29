/**
 * GET /api/terminal/hud?capture_id=<uuid>
 *
 * Returns Decision HUD payload for a given capture.
 * W-0309: mock → engine 실제 데이터 연결
 *
 * Data sources (실존 엔드포인트만 사용):
 *   GET /captures/{id}          → pattern_status + risk.p_win
 *   GET /captures?pattern_slug=&symbol=&limit=5 → evidence (same pattern, same symbol)
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

// Phase → next phase 정적 매핑 (패턴 공통 순서)
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
    'BTC corr breaks down',
    'Funding rate goes negative',
  ],
};

function mockPayload(captureId: string): HudPayload {
  return {
    pattern_status: { phase: 'ACCUMULATION', state: 'WATCHING', pattern_name: 'unknown', last_updated: new Date().toISOString() },
    evidence: { similar_captures: [], count: 0 },
    risk: { entry_p_win: null, threshold: 0.60, btc_trend: null },
    transition: { next_phase: 'MARKUP', conditions: PHASE_CONDITIONS['ACCUMULATION'] },
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
      const body = await res.json();
      capture = (body.capture ?? null) as Record<string, unknown> | null;
    }
  } catch {
    // timeout or engine down → fallback below
  }

  if (!capture) {
    return json({ ok: true, data: mockPayload(captureId), source: 'mock' });
  }

  const phase = (capture.phase as string | undefined) ?? 'UNKNOWN';
  const patternSlug = (capture.pattern_slug as string | undefined) ?? 'unknown';
  const status = (capture.status as string | undefined) ?? 'pending_outcome';
  const chartCtx = (capture.chart_context as Record<string, unknown> | undefined) ?? {};
  const pWin = typeof chartCtx.p_win === 'number' ? chartCtx.p_win : null;
  const btcTrend = (chartCtx.btc_trend as string | undefined) ?? null;
  const symbol = (capture.symbol as string | undefined) ?? '';
  const isWatching = Boolean(capture.is_watching);
  const hasVerdict = Boolean(capture.verdict_id);

  // ── 2. Fetch similar past captures (same pattern + symbol) ────────────────
  let similarCaptures: HudSimilarCapture[] = [];
  try {
    const params = new URLSearchParams({ pattern_slug: patternSlug, symbol, limit: '5' });
    const res = await engineFetch(`/captures?${params}`, {
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) {
      const body = await res.json();
      const list: unknown[] = Array.isArray(body.captures) ? body.captures : [];
      similarCaptures = list
        .filter((c): c is Record<string, unknown> => typeof c === 'object' && c !== null)
        .filter(c => c.capture_id !== captureId)
        .slice(0, 3)
        .map(c => ({
          capture_id: String(c.capture_id ?? ''),
          similarity: 1.0, // no score available from list endpoint
          outcome: c.verdict_id ? 'judged' : 'pending',
        }));
    }
  } catch {
    // non-critical — evidence card shows empty
  }

  // ── 3. Build HudPayload ───────────────────────────────────────────────────
  const nextPhase = NEXT_PHASE_MAP[phase.toUpperCase()] ?? null;
  const conditions = PHASE_CONDITIONS[phase.toUpperCase()] ?? [];

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
      btc_trend: (['UP', 'DOWN', 'NEUTRAL'].includes(String(btcTrend).toUpperCase())
        ? String(btcTrend).toUpperCase()
        : null) as 'UP' | 'DOWN' | 'NEUTRAL' | null,
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

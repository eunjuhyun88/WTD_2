import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './+server';

vi.mock('$lib/server/authGuard', () => ({
  getAuthUserFromCookies: vi.fn(),
}));

vi.mock('$lib/server/engineTransport', () => ({
  engineFetch: vi.fn(),
}));

import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { engineFetch } from '$lib/server/engineTransport';

describe('/api/terminal/pattern-seed/match', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires authentication', async () => {
    vi.mocked(getAuthUserFromCookies).mockResolvedValueOnce(null);

    const request = new Request('http://localhost/api/terminal/pattern-seed/match', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        thesis: 'OI 급등 후 저점 높이기',
        activeSymbol: 'TRADOORUSDT',
        timeframe: '15m',
      }),
    });

    const response = await POST({ request, cookies: {} } as any);
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: 'Authentication required' });
  });

  it('bridges thesis search into engine capture, benchmark search, and similar-live', async () => {
    vi.mocked(getAuthUserFromCookies).mockResolvedValueOnce({ id: 'user-1' } as any);

    vi.mocked(engineFetch)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            capture: {
              capture_id: 'cap-1',
              pattern_slug: 'tradoor-oi-reversal-v1',
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            benchmark_pack: {
              pattern_slug: 'tradoor-oi-reversal-v1',
            },
            research_run: {
              research_run_id: 'run-1',
            },
            artifact: {
              search_query_spec: {
                must_have_signals: ['oi_spike', 'dump_then_reclaim', 'higher_lows_sequence'],
              },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            results: [
              {
                symbol: 'PTBUSDT',
                phase: 'ACCUMULATION',
                path: 'REAL_DUMP→ACCUMULATION',
                similarity_score: 0.88,
                ranking_score: 0.94,
                canonical_feature_snapshot: {
                  oi_zscore: 2.3,
                  volume_percentile: 0.91,
                },
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ ok: true, candidates: [] }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );

    const request = new Request('http://localhost/api/terminal/pattern-seed/match', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        thesis: 'OI 급등 후 급락-반등, 15m 저점 상향 축적 뒤 돌파 찾기',
        activeSymbol: 'TRADOORUSDT',
        timeframe: '15m',
        boardSymbols: ['TRADOORUSDT', 'PTBUSDT'],
        snapshotNames: ['ptb.png'],
      }),
    });

    const response = await POST({ request, cookies: {} } as any);

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.ok).toBe(true);
    expect(payload.seed.captureId).toBe('cap-1');
    expect(payload.seed.researchRunId).toBe('run-1');
    expect(payload.seed.searchQuerySpec).toMatchObject({
      must_have_signals: ['oi_spike', 'dump_then_reclaim', 'higher_lows_sequence'],
    });
    expect(payload.seed.requestedSignals).toEqual([
      'oi_spike',
      'dump_then_reclaim',
      'higher_lows_sequence',
    ]);
    expect(payload.candidates).toHaveLength(1);
    expect(payload.candidates[0]).toMatchObject({
      symbol: 'PTBUSDT',
      source: 'engine',
      matchedSignals: ['oi_spike', 'dump_then_reclaim', 'higher_lows_sequence'],
      missingSignals: [],
    });

    expect(engineFetch).toHaveBeenCalledTimes(4);
    expect(vi.mocked(engineFetch).mock.calls[0][0]).toBe('/captures');
    expect(vi.mocked(engineFetch).mock.calls[1][0]).toBe('/captures/cap-1/benchmark_search');
    expect(vi.mocked(engineFetch).mock.calls[2][0]).toBe(
      '/patterns/tradoor-oi-reversal-v1/similar-live?top_k=10&min_similarity_score=0.2',
    );
    expect(vi.mocked(engineFetch).mock.calls[3][0]).toBe('/search/similar');

    const createRequest = vi.mocked(engineFetch).mock.calls[0][1];
    const createPayload = JSON.parse(String(createRequest?.body));
    expect(createPayload.capture_kind).toBe('manual_hypothesis');
    expect(createPayload.user_id).toBe('user-1');
    expect(createPayload.symbol).toBe('TRADOORUSDT');
    expect(createPayload.pattern_slug).toBe('tradoor-oi-reversal-v1');
    expect(createPayload.research_context.pattern_draft.pattern_family).toBe('tradoor_ptb_oi_reversal');
    expect(createPayload.research_context.pattern_draft.search_hints.preferred_timeframes).toEqual([
      '15m',
      '30m',
      '1h',
      '4h',
    ]);
  });
});

import { describe, expect, it, vi } from 'vitest';
import { POST } from './+server';

describe('/api/terminal/pattern-seed/match', () => {
  it('routes the thesis through canonical search seed and adapts engine candidates', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body ?? '{}'));
      expect(payload.limit).toBe(8);
      expect(payload.timeframe).toBe('15m');
      expect(payload.signature).toMatchObject({
        close_return_pct: expect.any(Number),
        high_low_range_pct: expect.any(Number),
        realized_volatility_pct: expect.any(Number),
        volume_ratio: expect.any(Number),
        funding_rate_mean: expect.any(Number),
        funding_rate_last: expect.any(Number),
        oi_change_1h_mean: expect.any(Number),
        oi_change_1h_max: expect.any(Number),
      });

      return Response.json({
        ok: true,
        owner: 'engine',
        plane: 'search',
        status: 'corpus_only',
        generated_at: '2026-04-23T00:00:00Z',
        run_id: 'run_1',
        request: payload,
        candidates: [
          {
            candidate_id: 'cand_1',
            window_id: 'win_1',
            symbol: 'TRADOORUSDT',
            timeframe: '1h',
            score: 0.91,
            payload: {
              window_id: 'win_1',
              symbol: 'TRADOORUSDT',
              timeframe: '1h',
              start_ts: '2026-04-13T00:00:00Z',
              end_ts: '2026-04-15T12:00:00Z',
              signature: {
                close_return_pct: 3.2,
                high_low_range_pct: 9.8,
                volume_ratio: 1.7,
                oi_change_1h_mean: 0.021,
                oi_change_1h_max: 0.047,
                funding_rate_mean: -0.0007,
                trend: 'up',
              },
            },
          },
        ],
      });
    });

    const request = new Request('http://localhost/api/terminal/pattern-seed/match', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        thesis: 'OI 급등 후 급락-반등 + 저점 높이는 패턴',
        activeSymbol: 'PTBUSDT',
        timeframe: '15m',
        assets: [
          {
            symbol: 'PTBUSDT',
            changePct15m: 0.4,
            changePct1h: 1.1,
            changePct4h: -4.8,
            volumeRatio1h: 1.4,
            oiChangePct1h: 4.2,
            fundingRate: -0.003,
          },
        ],
        snapshotNames: ['ptb.png'],
      }),
    });

    const res = await POST({ request, fetch: fetchMock as typeof fetch } as any);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/search/seed',
      expect.objectContaining({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: expect.any(AbortSignal),
      }),
    );
    expect(body.ok).toBe(true);
    expect(body.seed.snapshotCount).toBe(1);
    expect(body.seed.searchStatus).toBe('corpus_only');
    expect(body.candidates[0]).toMatchObject({
      symbol: 'TRADOORUSDT',
      source: 'search',
      score: 91,
    });
    expect(body.candidates[0].matchedSignals).toEqual(
      expect.arrayContaining(['oi_spike', 'higher_low_reclaim']),
    );
  });

  it('falls back to board-only ranking when the search plane is unavailable', async () => {
    const fetchMock = vi.fn(async () => new Response('upstream failed', { status: 502 }));

    const request = new Request('http://localhost/api/terminal/pattern-seed/match', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        thesis: 'OI 급등 후 급락-반등 + 저점 높이는 패턴',
        activeSymbol: 'PTBUSDT',
        timeframe: '15m',
        assets: [
          {
            symbol: 'PTBUSDT',
            changePct15m: 1.2,
            changePct1h: 3.4,
            changePct4h: -7.1,
            volumeRatio1h: 2.1,
            oiChangePct1h: 5.2,
            fundingRate: -0.004,
          },
        ],
      }),
    });

    const res = await POST({ request, fetch: fetchMock as typeof fetch } as any);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(body.seed.searchStatus).toBe('local_fallback');
    expect(body.candidates[0]).toMatchObject({
      symbol: 'PTBUSDT',
      source: 'board',
    });
  });
});

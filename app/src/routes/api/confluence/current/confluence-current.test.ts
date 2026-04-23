import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/rateLimit', () => ({
  chartFeedLimiter: { check: vi.fn(() => true) },
}));

vi.mock('$lib/server/requestIp', () => ({
  getRequestIp: vi.fn(() => '127.0.0.1'),
}));

vi.mock('$lib/server/confluenceHistory', () => ({
  pushConfluence: vi.fn(),
  streakBack: vi.fn(() => 0),
}));

import { pushConfluence } from '$lib/server/confluenceHistory';
import { GET } from './+server';

describe('/api/confluence/current', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prefers engine fact confluence and preserves public shape', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/facts/confluence')) {
        return new Response(
          JSON.stringify({
            ok: true,
            generated_at: '2026-04-23T00:00:00+00:00',
            symbol: 'BTCUSDT',
            timeframe: '4h',
            summary: {
              bias: 'bullish',
              score: 3,
              evidenceCount: 3,
              confidencePct: 71,
            },
            evidence: [
              { metric: 'ema_alignment', bias: 'bullish', value: 'bullish' },
              { metric: 'fear_greed', bias: 'bullish', value: 22 },
              { metric: 'coinbase_premium', bias: 'bullish', value: 0.0021 },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(null, { status: 404 });
    });

    const req = new Request('http://localhost/api/confluence/current?symbol=BTCUSDT&tf=4h');
    const res = await GET({
      url: new URL(req.url),
      request: req,
      getClientAddress: () => '127.0.0.1',
      fetch: fetchMock,
    } as any);

    expect(res.status).toBe(200);
    expect(res.headers.get('x-wtd-plane')).toBe('fact');
    expect(res.headers.get('x-wtd-upstream')).toBe('facts/confluence');
    expect(res.headers.get('x-wtd-state')).toBe('adapter');

    const body = await res.json();
    expect(body.symbol).toBe('BTCUSDT');
    expect(body.score).toBe(50);
    expect(body.confidence).toBe(0.71);
    expect(body.regime).toBe('strong_bull');
    expect(body.contributions).toHaveLength(3);
    expect(body.top).toHaveLength(3);
    expect(body.divergence).toBe(false);
    expect(vi.mocked(pushConfluence)).toHaveBeenCalledTimes(1);
  });

  it('falls back to legacy compute when engine facts are unavailable', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/facts/confluence')) {
        return new Response(null, { status: 503 });
      }
      if (url.includes('/api/cogochi/analyze')) {
        return Response.json({
          snapshot: { ensemble_score: 95, direction: 'long', active_block_count: 4 },
        });
      }
      if (url.includes('/api/market/venue-divergence')) {
        return Response.json({
          oi: [
            { venue: 'binance', current: 0.04 },
            { venue: 'bybit', current: 0.0 },
          ],
          funding: [],
        });
      }
      if (url.includes('/api/market/rv-cone')) {
        return Response.json({ percentile: { '30': 20 } });
      }
      if (url.includes('/api/market/stablecoin-ssr')) {
        return Response.json({ percentile: 10, regime: 'dry_powder_high' });
      }
      if (url.includes('/api/market/funding-flip')) {
        return Response.json({
          direction: 'neg_to_pos',
          persistedHours: 4,
          consecutiveIntervals: 1,
          currentRate: 0.0001,
        });
      }
      if (url.includes('/api/market/liq-clusters')) {
        return Response.json({
          currentPrice: 70000,
          cells: [{ priceBucket: 70500, timeBucket: 0, intensity: 1 }],
        });
      }
      if (url.includes('/api/market/options-snapshot')) {
        return Response.json({
          putCallRatioOi: 0.7,
          putCallRatioVol: 0.8,
          skew25d: -5,
          atmIvNearTerm: 45,
        });
      }
      return new Response(null, { status: 404 });
    });

    const req = new Request('http://localhost/api/confluence/current?symbol=ETHUSDT&tf=4h');
    const res = await GET({
      url: new URL(req.url),
      request: req,
      getClientAddress: () => '127.0.0.1',
      fetch: fetchMock,
    } as any);

    expect(res.status).toBe(200);
    expect(res.headers.get('x-wtd-upstream')).toBe('legacy-compute');
    expect(res.headers.get('x-wtd-state')).toBe('fallback');

    const body = await res.json();
    expect(body.symbol).toBe('ETHUSDT');
    expect(body.score).toBeGreaterThan(0);
    expect(body.contributions.length).toBeGreaterThan(0);
    expect(vi.mocked(pushConfluence)).toHaveBeenCalledTimes(1);
  });
});

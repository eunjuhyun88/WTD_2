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

vi.mock('$lib/server/marketIndicatorFeeds', () => ({
  loadVenueDivergence: vi.fn(),
  loadRvCone: vi.fn(),
  loadStablecoinSsr: vi.fn(),
  loadFundingFlip: vi.fn(),
  loadLiqClusters: vi.fn(),
  loadOptionsSnapshot: vi.fn(),
}));

import { pushConfluence } from '$lib/server/confluenceHistory';
import {
  loadFundingFlip,
  loadLiqClusters,
  loadOptionsSnapshot,
  loadRvCone,
  loadStablecoinSsr,
  loadVenueDivergence,
} from '$lib/server/marketIndicatorFeeds';
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
    expect(vi.mocked(loadVenueDivergence)).not.toHaveBeenCalled();
  });

  it('falls back to legacy compute when engine facts are unavailable', async () => {
    vi.mocked(loadVenueDivergence).mockResolvedValue({
      payload: {
        symbol: 'ETHUSDT',
        at: Date.now(),
        oi: [
          { venue: 'binance', label: 'Binance', current: 0.04 },
          { venue: 'bybit', label: 'Bybit', current: 0.0 },
        ],
        funding: [],
      },
      cacheStatus: 'miss',
    });
    vi.mocked(loadRvCone).mockResolvedValue({
      payload: {
        symbol: 'ETHUSDT',
        at: Date.now(),
        windows: [30],
        current: { '30': 0.2 },
        cone: {
          '30': { min: 0.1, p10: 0.12, p50: 0.18, p90: 0.24, max: 0.3 },
        },
        percentile: { '30': 20 },
      },
      cacheStatus: 'miss',
    });
    vi.mocked(loadStablecoinSsr).mockResolvedValue({
      payload: {
        at: Date.now(),
        current: 9,
        percentile: 10,
        sparkline: [8, 9],
        regime: 'dry_powder_high',
      },
      cacheStatus: 'miss',
    });
    vi.mocked(loadFundingFlip).mockResolvedValue({
      payload: {
        symbol: 'ETHUSDT',
        at: Date.now(),
        currentRate: 0.0001,
        previousRate: -0.0002,
        flippedAt: Date.now() - 14_400_000,
        persistedHours: 4,
        consecutiveIntervals: 1,
        direction: 'neg_to_pos',
      },
      cacheStatus: 'miss',
    });
    vi.mocked(loadLiqClusters).mockResolvedValue({
      payload: {
        symbol: 'ETHUSDT',
        at: Date.now(),
        window: '4h',
        currentPrice: 70000,
        cells: [{ priceBucket: 70500, timeBucket: 0, intensity: 1 }],
        bounds: { priceMin: 70500, priceMax: 70500, tMin: 0, tMax: 0 },
      },
      cacheStatus: 'miss',
    });
    vi.mocked(loadOptionsSnapshot).mockResolvedValue({
      payload: {
        currency: 'ETH',
        at: Date.now(),
        underlyingPrice: 3500,
        totalOI: { call: 1, put: 1, total: 2 },
        totalVolume24h: { call: 1, put: 1 },
        putCallRatioOi: 0.7,
        putCallRatioVol: 0.8,
        skew25d: -5,
        atmIvNearTerm: 45,
        counts: { callStrikes: 1, putStrikes: 1, nearTermInstruments: 1 },
        expiries: [],
        gamma: {
          pinLevel: null,
          pinDistancePct: null,
          maxPain: null,
          maxPainDistancePct: null,
          pinDirection: null,
        },
      },
      cacheStatus: 'miss',
    });

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
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(vi.mocked(loadVenueDivergence)).toHaveBeenCalledWith('ETHUSDT');
    expect(vi.mocked(loadOptionsSnapshot)).toHaveBeenCalledWith('ETH');
  });
});

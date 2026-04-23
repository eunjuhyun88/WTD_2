import { describe, it, expect, vi } from 'vitest';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { collectMarketSnapshot, collectPublicMarketSnapshot } from '$lib/server/marketSnapshotService';

vi.mock('$lib/server/marketSnapshotService', () => ({
  collectMarketSnapshot: vi.fn(async () => ({
    updated: true,
    pair: 'BTCUSDT',
    timeframe: '1h',
    at: Date.now(),
    persisted: false,
    warning: null,
    sources: { kline: 'ok' },
  })),
  collectPublicMarketSnapshot: vi.fn(async () => ({
    updated: ['klines'],
    pair: 'BTCUSDT',
    timeframe: '1h',
    at: Date.now(),
    persisted: false,
    warning: null,
    sources: { klines: true },
  })),
}));
vi.mock('$lib/server/authGuard', () => ({
  getAuthUserFromCookies: vi.fn(async () => null),
}));
vi.mock('$lib/server/marketFeedService', () => ({
  normalizePair: vi.fn((v: string | null) => v ?? 'BTCUSDT'),
  normalizeTimeframe: vi.fn((v: string | null) => v ?? '1h'),
}));
vi.mock('$lib/server/rateLimit', () => ({ marketSnapshotLimiter: {} }));
vi.mock('$lib/server/authSecurity', () => ({
  runIpRateLimitGuard: vi.fn(async () => ({ ok: true })),
}));
vi.mock('$lib/server/publicCacheHeaders', () => ({
  buildPublicCacheHeaders: vi.fn(() => ({})),
}));
vi.mock('$lib/server/publicRouteCache', () => ({
  createSharedPublicRouteCache: vi.fn(() => ({
    run: async (_key: string, fn: () => Promise<any>) => ({ payload: await fn(), cacheStatus: 'miss' }),
  })),
}));
vi.mock('$lib/server/requestGuards', () => ({
  isRequestBodyTooLargeError: vi.fn(() => false),
  readJsonBody: vi.fn(),
}));

import { GET } from './+server';

describe('/api/market/snapshot', () => {
  it('forces non-persistent reads on GET even for authenticated callers', async () => {
    vi.mocked(getAuthUserFromCookies).mockResolvedValueOnce({ id: 'user-1' } as any);
    const req = new Request('http://localhost/api/market/snapshot?pair=BTCUSDT&timeframe=1h&persist=1');
    const res = await GET({
      fetch: globalThis.fetch,
      url: new URL(req.url),
      cookies: {},
      getClientAddress: () => '127.0.0.1',
      request: req,
    } as any);

    expect(res.status).toBe(200);
    expect(vi.mocked(collectPublicMarketSnapshot)).toHaveBeenCalledWith(
      globalThis.fetch,
      expect.objectContaining({
        pair: 'BTCUSDT',
        timeframe: '1h',
      }),
    );
    expect(vi.mocked(collectMarketSnapshot)).not.toHaveBeenCalled();
  });

  it('returns success payload for public GET', async () => {
    const req = new Request('http://localhost/api/market/snapshot?pair=BTCUSDT&timeframe=1h');
    const res = await GET({
      fetch: globalThis.fetch,
      url: new URL(req.url),
      cookies: {},
      getClientAddress: () => '127.0.0.1',
      request: req,
    } as any);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.pair).toBe('BTCUSDT');
  });
});

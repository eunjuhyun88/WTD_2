import { describe, it, expect, vi } from 'vitest';

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


import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/rateLimit', () => ({
  terminalReadLimiter: { check: vi.fn(() => true) },
}));

vi.mock('$lib/server/providers/binance', () => ({
  pairToSymbol: vi.fn((pair: string) => pair.replace('/', '')),
}));

vi.mock('$lib/server/providers/rawSources', () => ({
  readRaw: vi.fn(),
}));

vi.mock('$lib/server/marketFeedService', () => ({
  fetchDerivatives: vi.fn(),
  normalizePair: vi.fn((value: string | null) => value ?? 'BTC/USDT'),
  normalizeTimeframe: vi.fn((value: string | null) => value ?? '4h'),
}));

vi.mock('$lib/server/coinmarketcap', () => ({
  fetchCoinMarketCapQuote: vi.fn(),
  hasCoinMarketCapApiKey: vi.fn(() => true),
}));

vi.mock('$lib/server/enginePlanes/facts', () => ({
  fetchPerpContextProxy: vi.fn(),
}));

import { readRaw } from '$lib/server/providers/rawSources';
import { fetchDerivatives } from '$lib/server/marketFeedService';
import { fetchCoinMarketCapQuote } from '$lib/server/coinmarketcap';
import { fetchPerpContextProxy } from '$lib/server/enginePlanes/facts';
import { GET } from './+server';

describe('/api/market/flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prefers engine perp context and preserves public payload shape', async () => {
    vi.mocked(fetchPerpContextProxy).mockResolvedValueOnce({
      ok: true,
      owner: 'engine',
      plane: 'fact',
      kind: 'perp_context',
      status: 'transitional',
      generated_at: '2026-04-23T00:00:00Z',
      symbol: 'BTCUSDT',
      timeframe: '4h',
      source: { id: 'perp', state: 'live', rows: 600, summary: '600 rows' },
      metrics: {
        funding_rate: -0.0012,
        oi_change_1h: 0.02,
        oi_change_24h: 0.05,
        long_short_ratio: 0.88,
        taker_buy_ratio_1h: 0.61,
      },
      regime: { crowding: 'crowded_shorts', cvd_state: 'buying' },
      notes: [],
    });
    vi.mocked(fetchDerivatives).mockResolvedValueOnce({
      pair: 'BTC/USDT',
      timeframe: '4h',
      oi: 3_500_000_000,
      funding: 0.0004,
      predFunding: 0.0005,
      lsRatio: 1.05,
      liqLong24h: 12_000_000,
      liqShort24h: 18_000_000,
      updatedAt: 1_712_000_000_000,
    });
    vi.mocked(readRaw).mockResolvedValueOnce({
      priceChangePercent: '3.25',
      quoteVolume: '2500000000',
    } as any);
    vi.mocked(fetchCoinMarketCapQuote).mockResolvedValueOnce({
      symbol: 'BTC',
      price: 72000,
      marketCap: 1_400_000_000_000,
      volume24h: 55_000_000_000,
      change24hPct: 3.1,
      updatedAt: 1_712_000_000_000,
    });

    const req = new Request('http://localhost/api/market/flow?pair=BTC/USDT&timeframe=4h');
    const res = await GET({
      fetch: globalThis.fetch,
      url: new URL(req.url),
      getClientAddress: () => '127.0.0.1',
      request: req,
    } as any);

    expect(res.status).toBe(200);
    expect(res.headers.get('x-wtd-plane')).toBe('fact');
    expect(res.headers.get('x-wtd-upstream')).toBe('facts/perp-context+legacy-enrichment');
    expect(res.headers.get('x-wtd-state')).toBe('adapter');

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.pair).toBe('BTC/USDT');
    expect(body.data.snapshot.funding).toBe(-0.0012);
    expect(body.data.snapshot.lsRatio).toBe(0.88);
    expect(body.data.snapshot.liqLong24h).toBe(12_000_000);
    expect(body.data.snapshot.liqShort24h).toBe(18_000_000);
    expect(body.data.bias).toBe('LONG');
    expect(body.data.records[0].source).toBe('COINALYZE');
  });

  it('falls back to legacy compute when engine perp context is unavailable', async () => {
    vi.mocked(fetchPerpContextProxy).mockResolvedValueOnce(null);
    vi.mocked(fetchDerivatives).mockResolvedValueOnce({
      pair: 'ETH/USDT',
      timeframe: '1h',
      oi: 1_800_000_000,
      funding: 0.001,
      predFunding: 0.0011,
      lsRatio: 1.2,
      liqLong24h: 25_000_000,
      liqShort24h: 5_000_000,
      updatedAt: 1_712_100_000_000,
    });
    vi.mocked(readRaw).mockResolvedValueOnce({
      priceChangePercent: '-2.5',
      quoteVolume: '1200000000',
    } as any);
    vi.mocked(fetchCoinMarketCapQuote).mockResolvedValueOnce(null as any);

    const req = new Request('http://localhost/api/market/flow?pair=ETH/USDT&timeframe=1h');
    const res = await GET({
      fetch: globalThis.fetch,
      url: new URL(req.url),
      getClientAddress: () => '127.0.0.1',
      request: req,
    } as any);

    expect(res.status).toBe(200);
    expect(res.headers.get('x-wtd-upstream')).toBe('legacy-compute');
    expect(res.headers.get('x-wtd-state')).toBe('fallback');

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.snapshot.funding).toBe(0.001);
    expect(body.data.snapshot.lsRatio).toBe(1.2);
    expect(body.data.bias).toBe('SHORT');
    expect(body.data.records).toHaveLength(2);
  });
});

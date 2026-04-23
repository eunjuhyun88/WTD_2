import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/rateLimit', () => ({
  terminalReadLimiter: { check: vi.fn(() => true) },
}));

vi.mock('$lib/server/marketFeedService', () => ({
  fetchDerivatives: vi.fn(),
  normalizePair: vi.fn((value: string | null) => value ?? 'BTC/USDT'),
  normalizeTimeframe: vi.fn((value: string | null) => value ?? '4h'),
}));

vi.mock('$lib/server/enginePlanes/facts', () => ({
  fetchPerpContextProxy: vi.fn(),
}));

vi.mock('$lib/server/providers/dexscreener', () => ({
  fetchDexAdsLatest: vi.fn(),
  fetchDexCommunityTakeoversLatest: vi.fn(),
  fetchDexTokenBoostsLatest: vi.fn(),
  fetchDexTokens: vi.fn(),
}));

import { fetchDerivatives } from '$lib/server/marketFeedService';
import { fetchPerpContextProxy } from '$lib/server/enginePlanes/facts';
import {
  fetchDexAdsLatest,
  fetchDexCommunityTakeoversLatest,
  fetchDexTokenBoostsLatest,
  fetchDexTokens,
} from '$lib/server/providers/dexscreener';
import { GET } from './+server';

describe('/api/market/events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchDexAdsLatest).mockResolvedValue([]);
    vi.mocked(fetchDexCommunityTakeoversLatest).mockResolvedValue([]);
    vi.mocked(fetchDexTokenBoostsLatest).mockResolvedValue([]);
    vi.mocked(fetchDexTokens).mockResolvedValue([]);
  });

  it('prefers engine perp facts and preserves dexscreener events', async () => {
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
    vi.mocked(fetchDexCommunityTakeoversLatest).mockResolvedValueOnce([
      { chainId: 'solana', tokenAddress: 'So11111111111111111111111111111111111111112', claimDate: '2026-04-23T00:00:00Z' } as any,
    ]);
    vi.mocked(fetchDexTokens).mockResolvedValueOnce([
      { baseToken: { address: 'So11111111111111111111111111111111111111112', symbol: 'SOL', name: 'Solana' } },
    ] as any);

    const req = new Request('http://localhost/api/market/events?pair=BTC/USDT&timeframe=4h');
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
    expect(body.data.records).toHaveLength(2);
    expect(body.data.records[0].text).toContain('Funding -0.1200%');
    expect(body.data.records[0].text).toContain('crowded_shorts');
    expect(body.data.records[1].text).toContain('SOL');
  });

  it('falls back to legacy derivatives when engine perp facts are unavailable', async () => {
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

    const req = new Request('http://localhost/api/market/events?pair=ETH/USDT&timeframe=1h');
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
    expect(body.data.records).toHaveLength(1);
    expect(body.data.records[0].text).toContain('Funding 0.1000%');
    expect(body.data.records[0].text).toContain('L/S 1.20');
  });
});

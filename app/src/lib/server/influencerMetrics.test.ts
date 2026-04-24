import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/api/defillama', () => ({
  fetchTotalTvl: vi.fn(),
}));

vi.mock('$lib/server/coinmetrics', () => ({
  fetchCoinMetricsData: vi.fn(),
}));

vi.mock('$lib/server/feargreed', () => ({
  fetchFearGreed: vi.fn(),
}));

vi.mock('$lib/server/lunarcrush', () => ({
  fetchTopicSocial: vi.fn(),
  hasLunarCrushKey: vi.fn(),
}));

vi.mock('$lib/server/dune', () => ({
  fetchActiveAddresses: vi.fn(),
  fetchDexVolume24hUsd: vi.fn(),
  fetchWhaleActivity: vi.fn(),
  hasDuneKey: vi.fn(),
}));

vi.mock('$lib/server/providers/cache', () => ({
  getCached: vi.fn(),
  setCache: vi.fn(),
}));

import { fetchTotalTvl } from '$lib/api/defillama';
import { fetchCoinMetricsData } from '$lib/server/coinmetrics';
import { fetchFearGreed } from '$lib/server/feargreed';
import { fetchTopicSocial, hasLunarCrushKey } from '$lib/server/lunarcrush';
import {
  fetchActiveAddresses,
  fetchDexVolume24hUsd,
  fetchWhaleActivity,
  hasDuneKey,
} from '$lib/server/dune';
import { getCached, setCache } from '$lib/server/providers/cache';
import { fetchInfluencerMetrics } from './influencerMetrics';

describe('fetchInfluencerMetrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCached).mockReturnValue(null);
    vi.mocked(hasDuneKey).mockReturnValue(true);
    vi.mocked(hasLunarCrushKey).mockReturnValue(true);
  });

  it('builds a canonical payload with provider data and structured report bindings', async () => {
    vi.mocked(fetchCoinMetricsData).mockResolvedValue({
      onchainMetrics: { mvrv: 1.31, nupl: 0.24 },
      exchangeReserve: { netflow24h: -3_000_000_000, change7dPct: -9.8 },
      whaleData: { whaleCount: 77, whaleNetflow: -420_000_000 },
    } as any);
    vi.mocked(fetchFearGreed).mockResolvedValue({
      current: { value: 64, classification: 'Greed' },
      points: [
        { value: 58 },
        { value: 60 },
        { value: 62 },
        { value: 64 },
      ],
    } as any);
    vi.mocked(fetchTopicSocial).mockResolvedValue({
      postsActive: 1820,
      interactions24h: 3_400_000,
      contributorsActive: 920,
      socialDominance: 12.4,
    } as any);
    vi.mocked(fetchTotalTvl).mockResolvedValue({
      tvl: 110_000_000_000,
      change24h: 2.1,
    } as any);
    vi.mocked(fetchDexVolume24hUsd).mockResolvedValue(8_800_000_000);
    vi.mocked(fetchActiveAddresses).mockResolvedValue(2_040_000);
    vi.mocked(fetchWhaleActivity).mockResolvedValue(88);

    const payload = await fetchInfluencerMetrics('ETHUSDT');

    expect(fetchCoinMetricsData).toHaveBeenCalledWith('eth');
    expect(payload.providers.onchain.status).toBe('live');
    expect(payload.providers.defi.status).toBe('live');
    expect(payload.providers.sentiment.status).toBe('live');
    expect(payload.onchain.activeAddresses).toBe(2_040_000);
    expect(payload.defi.dexVolumeTvlRatio).toBeCloseTo(0.08, 4);
    expect(payload.sentiment.fearGreedHistory).toEqual([64, 62, 60, 58]);
    expect(payload.report.metricLeaderboard[0]?.id).toBe('active_addresses');
    expect(payload.report.metricLeaderboard[0]?.bindings[0]?.status).toBe('live');
    expect(payload.report.metricLeaderboard.find((item) => item.id === 'realized_price')?.bindings.map((item) => item.status)).toEqual([
      'reference_only',
      'planned',
    ]);
    expect(payload.report.toolPackages.map((item) => item.id)).toContain('defi-llama-dune');
    expect(setCache).toHaveBeenCalledTimes(1);
  });
});

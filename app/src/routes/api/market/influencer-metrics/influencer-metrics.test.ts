import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/influencerMetrics', () => ({
  fetchInfluencerMetrics: vi.fn(),
}));

import { fetchInfluencerMetrics } from '$lib/server/influencerMetrics';
import { GET } from './+server';

describe('/api/market/influencer-metrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the canonical influencer metrics payload', async () => {
    vi.mocked(fetchInfluencerMetrics).mockResolvedValue({
      symbol: 'BTCUSDT',
      baseAsset: 'BTC',
      at: Date.now(),
      providers: {
        onchain: { provider: 'coinmetrics+dune', status: 'partial' },
        defi: { provider: 'defillama+dune', status: 'partial' },
        sentiment: { provider: 'alternative_me+lunarcrush', status: 'partial' },
      },
      onchain: {
        mvrv: 1.2,
        nupl: 0.1,
        exchangeNetflowUsd: -1_200_000_000,
        exchangeNetflowChange7dPct: -4.2,
        activeAddresses: null,
        whaleActivity: 42,
        whaleNetflowUsd: -300_000_000,
      },
      defi: {
        totalTvlUsd: 98_000_000_000,
        totalTvlChange24hPct: 1.3,
        dexVolume24hUsd: 8_100_000_000,
        dexVolumeTvlRatio: 0.082,
      },
      sentiment: {
        fearGreed: 58,
        fearGreedClassification: 'Neutral',
        fearGreedHistory: [55, 57, 58],
        socialPostsActive: null,
        socialInteractions24h: null,
        socialContributorsActive: null,
        socialDominancePct: null,
      },
      report: {
        asOfDate: '2026-04-22',
        scope: {
          platform: 'X',
          sampleWindow: '2026-03-01..2026-04-22',
          accountSet: ['@glassnode'],
          filters: ['min_faves >= 30'],
        },
        methodology: ['structured report'],
        keyTakeaways: ['on-chain first'],
        primaryDailyStack: {
          label: 'Influencer Core Four',
          metrics: ['Active Addresses', 'Exchange Flow', 'MVRV/Realized Price', 'TVL'],
          note: 'core stack',
        },
        toolPackages: [],
        metricLeaderboard: [],
        trendSummary: [],
        conclusions: [],
      },
    } as any);

    const request = new Request('http://localhost/api/market/influencer-metrics?symbol=BTCUSDT');
    const res = await GET({
      url: new URL(request.url),
      request,
      getClientAddress: () => '127.0.0.1',
    } as any);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(fetchInfluencerMetrics).toHaveBeenCalledWith('BTCUSDT');
    expect(body.report.primaryDailyStack.label).toBe('Influencer Core Four');
    expect(body.onchain.exchangeNetflowUsd).toBe(-1_200_000_000);
  });

  it('rejects invalid symbols before touching the fetcher', async () => {
    const request = new Request('http://localhost/api/market/influencer-metrics?symbol=BTC');
    const res = await GET({
      url: new URL(request.url),
      request,
      getClientAddress: () => '127.0.0.1',
    } as any);

    expect(res.status).toBe(400);
    expect(fetchInfluencerMetrics).not.toHaveBeenCalled();
  });
});

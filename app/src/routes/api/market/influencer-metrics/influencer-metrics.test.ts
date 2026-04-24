import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/influencerMetrics', () => ({
  fetchInfluencerMetrics: vi.fn(),
}));

vi.mock('$lib/server/enginePlanes/facts', () => ({
  fetchIndicatorCatalogProxy: vi.fn(),
}));

import { fetchIndicatorCatalogProxy } from '$lib/server/enginePlanes/facts';
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
    vi.mocked(fetchIndicatorCatalogProxy).mockResolvedValue({
      ok: true,
      owner: 'engine',
      plane: 'fact',
      kind: 'indicator_catalog',
      status: 'transitional',
      generated_at: '2026-04-24T00:00:00.000Z',
      total: 100,
      matched: 100,
      filters: {},
      coverage: {
        live: 40,
        partial: 20,
        usable_now: 60,
        coverage_pct: 60,
      },
      counts: {},
      metrics: [
        {
          id: 'active_addresses',
          label: 'Active Addresses',
          family: 'onchain',
          status: 'live',
          primary_sources: ['coinmetrics', 'dune'],
          current_owner: 'engine',
          promotion_stage: 'promoted',
          next_gate: 'keep contract stable and widen canonical consumers',
          notes: 'live',
        },
      ],
      notes: [],
    } as any);

    const request = new Request('http://localhost/api/market/influencer-metrics?symbol=BTCUSDT');
    const res = await GET({
      url: new URL(request.url),
      request,
      fetch: globalThis.fetch,
      getClientAddress: () => '127.0.0.1',
    } as any);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(fetchInfluencerMetrics).toHaveBeenCalledWith('BTCUSDT');
    expect(fetchIndicatorCatalogProxy).toHaveBeenCalledWith(globalThis.fetch);
    expect(body.report.primaryDailyStack.label).toBe('Influencer Core Four');
    expect(body.onchain.exchangeNetflowUsd).toBe(-1_200_000_000);
    expect(body.factCoverage.kind).toBe('indicator_catalog');
    expect(body.factCoverage.coverage.totalBindings).toBe(0);
    expect(res.headers.get('x-wtd-upstream')).toBe('facts/indicator-catalog+live-influencer-metrics');
    expect(res.headers.get('x-wtd-state')).toBe('adapter');
  });

  it('adds alias-normalized fact coverage for report bindings and falls back cleanly when catalog is unavailable', async () => {
    vi.mocked(fetchInfluencerMetrics).mockResolvedValue({
      symbol: 'ETHUSDT',
      baseAsset: 'ETH',
      at: Date.now(),
      providers: {
        onchain: { provider: 'coinmetrics+dune', status: 'partial' },
        defi: { provider: 'defillama+dune', status: 'partial' },
        sentiment: { provider: 'alternative_me+lunarcrush', status: 'partial' },
      },
      onchain: {
        mvrv: 1.1,
        nupl: 0.2,
        exchangeNetflowUsd: -100,
        exchangeNetflowChange7dPct: -1,
        activeAddresses: 1000,
        whaleActivity: 55,
        whaleNetflowUsd: -20,
      },
      defi: {
        totalTvlUsd: 100,
        totalTvlChange24hPct: 1.2,
        dexVolume24hUsd: 10,
        dexVolumeTvlRatio: 0.1,
      },
      sentiment: {
        fearGreed: 60,
        fearGreedClassification: 'Greed',
        fearGreedHistory: [58, 59, 60],
        socialPostsActive: 200,
        socialInteractions24h: 300,
        socialContributorsActive: 40,
        socialDominancePct: 1.3,
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
          metrics: ['Active Addresses'],
          note: 'core stack',
        },
        toolPackages: [],
        metricLeaderboard: [
          {
            id: 'whale_activity',
            rank: 1,
            family: 'OnChain',
            label: 'Whale Activity',
            whyItMatters: 'matters',
            influencerUsage: 'usage',
            trackedBy: [],
            exampleMentions: [],
            bindings: [
              {
                label: 'Whale proxy',
                status: 'live',
                indicatorId: 'whale_activity',
                payloadPath: 'onchain.whaleActivity',
                providerKey: 'onchain',
                note: 'alias',
              },
              {
                label: 'TVL ratio proxy',
                status: 'planned',
                indicatorId: 'dex_volume_tvl_ratio',
                payloadPath: 'defi.dexVolumeTvlRatio',
                providerKey: 'defi',
                note: 'alias',
              },
            ],
          },
        ],
        trendSummary: [],
        conclusions: [],
      },
    } as any);
    vi.mocked(fetchIndicatorCatalogProxy).mockResolvedValue({
      ok: true,
      owner: 'engine',
      plane: 'fact',
      kind: 'indicator_catalog',
      status: 'transitional',
      generated_at: '2026-04-24T00:00:00.000Z',
      total: 100,
      matched: 100,
      filters: {},
      coverage: {
        live: 40,
        partial: 20,
        usable_now: 60,
        coverage_pct: 60,
      },
      counts: {},
      metrics: [
        {
          id: 'whale_tx_count',
          label: 'Whale Transaction Count',
          family: 'onchain',
          status: 'live',
          primary_sources: ['dune'],
          current_owner: 'app_bridge',
          promotion_stage: 'operational',
          next_gate: 'cut app/search/agent consumers over to the canonical engine contract',
          notes: 'live',
        },
        {
          id: 'volume_tvl_ratio',
          label: 'Volume/TVL Ratio',
          family: 'defi_dex',
          status: 'missing',
          primary_sources: ['defillama', 'dune'],
          current_owner: 'none',
          promotion_stage: 'cataloged',
          next_gate: 'implement local ingress/read path or unblock provider access',
          notes: 'missing',
        },
      ],
      notes: [],
    } as any);

    const request = new Request('http://localhost/api/market/influencer-metrics?symbol=ETHUSDT');
    const res = await GET({
      url: new URL(request.url),
      request,
      fetch: globalThis.fetch,
      getClientAddress: () => '127.0.0.1',
    } as any);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.factCoverage.coverage.totalBindings).toBe(2);
    expect(body.factCoverage.coverage.matched).toBe(2);
    expect(body.factCoverage.items[0]).toMatchObject({
      requestedIndicatorId: 'whale_activity',
      catalogIndicatorId: 'whale_tx_count',
      status: 'live',
    });
    expect(body.factCoverage.items[1]).toMatchObject({
      requestedIndicatorId: 'dex_volume_tvl_ratio',
      catalogIndicatorId: 'volume_tvl_ratio',
      status: 'missing',
    });
    expect(res.headers.get('x-wtd-upstream')).toBe('facts/indicator-catalog+live-influencer-metrics');
  });

  it('returns the app payload unchanged when engine fact coverage is unavailable', async () => {
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
        mvrv: null,
        nupl: null,
        exchangeNetflowUsd: null,
        exchangeNetflowChange7dPct: null,
        activeAddresses: null,
        whaleActivity: null,
        whaleNetflowUsd: null,
      },
      defi: {
        totalTvlUsd: null,
        totalTvlChange24hPct: null,
        dexVolume24hUsd: null,
        dexVolumeTvlRatio: null,
      },
      sentiment: {
        fearGreed: null,
        fearGreedClassification: null,
        fearGreedHistory: [],
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
          metrics: ['Active Addresses'],
          note: 'core stack',
        },
        toolPackages: [],
        metricLeaderboard: [],
        trendSummary: [],
        conclusions: [],
      },
    } as any);
    vi.mocked(fetchIndicatorCatalogProxy).mockResolvedValue(null);

    const request = new Request('http://localhost/api/market/influencer-metrics?symbol=BTCUSDT');
    const res = await GET({
      url: new URL(request.url),
      request,
      fetch: globalThis.fetch,
      getClientAddress: () => '127.0.0.1',
    } as any);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.factCoverage).toBeUndefined();
    expect(res.headers.get('x-wtd-upstream')).toBe('live-influencer-metrics');
    expect(res.headers.get('x-wtd-state')).toBe('fallback');
  });

  it('rejects invalid symbols before touching the fetcher', async () => {
    const request = new Request('http://localhost/api/market/influencer-metrics?symbol=BTC');
    const res = await GET({
      url: new URL(request.url),
      request,
      fetch: globalThis.fetch,
      getClientAddress: () => '127.0.0.1',
    } as any);

    expect(res.status).toBe(400);
    expect(fetchInfluencerMetrics).not.toHaveBeenCalled();
    expect(fetchIndicatorCatalogProxy).not.toHaveBeenCalled();
  });
});

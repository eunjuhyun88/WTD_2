import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { normalizePair, normalizeTimeframe } from '$lib/server/marketFeedService';
import { loadAgentContextPack } from '$lib/server/agentContextPack';
import { buildIntelPolicyOutput, emptyPanels } from '$lib/server/intelPolicyRuntime';
import { loadMarketEvents } from '$lib/server/marketEvents';
import { loadMarketFlow } from '$lib/server/marketFlow';
import { adaptEngineMarketCapSnapshot, fetchMarketCapOverview } from '$lib/server/marketCapPlane';
import { fetchFactMarketCapProxy } from '$lib/server/enginePlanes/facts';
import { loadMarketNews } from '$lib/server/marketNews';
import { loadPerpContextBridge } from '$lib/server/perpContextBridge';
import { loadMarketTrending } from '$lib/server/marketTrending';
import { getOrRunOpportunityScan } from '$lib/server/opportunityScan';

export const config = {
	runtime: 'nodejs22.x',
	regions: ['iad1'],
	memory: 1024,
	maxDuration: 30,
};

import { buildPublicCacheHeaders } from '$lib/server/publicCacheHeaders';
import { createSharedPublicRouteCache } from '$lib/server/publicRouteCache';

const CACHE_TTL_MS = 20_000;

const intelPolicyCache = createSharedPublicRouteCache<ReturnType<typeof buildIntelPolicyOutput>>({
  scope: 'terminal:intel-policy',
  ttlMs: CACHE_TTL_MS,
});

function cacheKey(pair: string, timeframe: string): string {
  return `${pair}:${timeframe}`;
}

function symbolFromPair(pair: string): string {
  return pair.replace('/', '').toUpperCase();
}

async function runIntelPolicy(fetchFn: typeof fetch, pair: string, timeframe: string) {
  const token = pair.split('/')[0] ?? 'BTC';
  const perpBridgePromise = loadPerpContextBridge(fetchFn, { pair, timeframe });

  const [newsRes, eventsRes, flowRes, macroRes, trendingRes, picksRes, agentContext] = await Promise.all([
    fetchJsonSafe(
      fetchFn,
      `/api/market/news?limit=40&offset=0&token=${encodeURIComponent(token)}&sort=importance&interval=1m`,
    ),
    fetchJsonSafe(fetchFn, `/api/market/events?pair=${encodeURIComponent(pair)}&timeframe=${encodeURIComponent(timeframe)}`),
    fetchJsonSafe(fetchFn, `/api/market/flow?pair=${encodeURIComponent(pair)}&timeframe=${encodeURIComponent(timeframe)}`),
    fetchJsonSafe(fetchFn, '/api/market/macro-overview'),
    fetchJsonSafe(fetchFn, '/api/market/trending?section=all&limit=20'),
    fetchJsonSafe(fetchFn, '/api/terminal/opportunity-scan?limit=15'),
    loadAgentContextPack({
      fetchFn,
      symbol: symbolFromPair(pair),
      timeframe,
      captureLimit: 3,
    }),
    perpBridgePromise.then((bridge) =>
      loadMarketFlow(fetchFn, { pair, timeframe, perpBridge: bridge }),
    ),
    perpBridgePromise.then((bridge) =>
      loadMarketEvents(fetchFn, { pair, timeframe, perpBridge: bridge }),
    ),
    loadMacroOverview(fetchFn),
  ]);

  const newsRecords = newsData.records;
  const eventRecords = eventsResult.data.records;
  const flowSnapshot = flowResult.data.snapshot ?? null;
  const flowRecords = flowResult.data.records;
  const trendingCoins = trendingData.trending;
  const pickCoins = picksData.payload.result.coins;

  return buildIntelPolicyOutput({
    pair,
    timeframe,
    newsRecords,
    eventRecords,
    flowSnapshot,
    flowRecords,
    macroOverview,
    trendingCoins,
    pickCoins,
    agentContext,
  });
}

export const GET: RequestHandler = async ({ fetch, url }) => {
  let pair = 'BTC/USDT';
  let timeframe = '4h';

  try {
    pair = normalizePair(url.searchParams.get('pair'));
    timeframe = normalizeTimeframe(url.searchParams.get('timeframe'));
    const { payload, cacheStatus } = await intelPolicyCache.run(
      cacheKey(pair, timeframe),
      () => runIntelPolicy(fetch, pair, timeframe),
    );

    return json(
      {
        ok: true,
        data: payload,
        cached: cacheStatus === 'hit',
        coalesced: cacheStatus === 'coalesced',
      },
      {
        headers: buildPublicCacheHeaders({
          browserMaxAge: 15,
          sharedMaxAge: 20,
          staleWhileRevalidate: 30,
          cacheStatus,
        }),
      },
    );
  } catch (error: any) {
    if (typeof error?.message === 'string' && error.message.includes('pair must be like')) {
      return json({ error: error.message }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
    }
    if (typeof error?.message === 'string' && error.message.includes('timeframe must be one of')) {
      return json({ error: error.message }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
    }

    console.error('[api/terminal/intel-policy] error:', error);

    return json(
      {
        ok: false,
        error: 'Failed to build intel policy output',
        data: {
          generatedAt: Date.now(),
          decision: {
            bias: 'wait',
            confidence: 100,
            shouldTrade: false,
            qualityGateScore: 0,
            longScore: 0,
            shortScore: 0,
            waitScore: 100,
            netEdge: 0,
            edgePct: 0,
            coveragePct: 0,
            reasons: [],
            blockers: ['policy_runtime_error'],
            policyVersion: '3.0.0',
            breakdown: [],
          },
          panels: emptyPanels(),
          summary: {
            pair,
            timeframe,
            domainsUsed: [],
            avgHelpfulness: 0,
          },
        },
      },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
};

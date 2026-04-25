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
  const perpBridge = await loadPerpContextBridge(fetchFn, { pair, timeframe });

  const [newsResult, eventsResult, flowResult, trendingResult, picksResult, agentContext, macroCapSnapshot] =
    await Promise.allSettled([
      loadMarketNews({ limit: 40, offset: 0, token, interval: '1m', sortBy: 'importance' }),
      loadMarketEvents(fetchFn, { pair, timeframe, perpBridge }),
      loadMarketFlow(fetchFn, { pair, timeframe, perpBridge }),
      loadMarketTrending({ limit: 20, section: 'all' }),
      getOrRunOpportunityScan(15),
      loadAgentContextPack({ fetchFn, symbol: symbolFromPair(pair), timeframe, captureLimit: 3 }),
      fetchFactMarketCapProxy(fetchFn, { offline: true }),
    ]);

  const newsRecords = newsResult.status === 'fulfilled' ? newsResult.value.records : [];
  const eventRecords = eventsResult.status === 'fulfilled' ? eventsResult.value.data.records : [];
  const flowData = flowResult.status === 'fulfilled' ? flowResult.value.data : null;
  const flowSnapshot = flowData?.snapshot ?? null;
  const flowRecords = flowData?.records ?? [];
  const trendingCoins = trendingResult.status === 'fulfilled' ? (trendingResult.value.trending ?? []) : [];
  const pickCoins = picksResult.status === 'fulfilled' ? (picksResult.value?.payload?.result?.coins ?? []) : [];
  const agentContextPack = agentContext.status === 'fulfilled' ? agentContext.value : null;
  const capSnapshot = macroCapSnapshot.status === 'fulfilled' ? macroCapSnapshot.value : null;
  const macroOverview = adaptEngineMarketCapSnapshot(capSnapshot);

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
    agentContext: agentContextPack,
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

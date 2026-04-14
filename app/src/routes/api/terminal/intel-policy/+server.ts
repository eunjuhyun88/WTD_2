import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { normalizePair, normalizeTimeframe } from '$lib/server/marketFeedService';
import { buildIntelPolicyOutput, emptyPanels } from '$lib/server/intelPolicyRuntime';
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

async function fetchJsonSafe(fetchFn: typeof fetch, path: string): Promise<any | null> {
  try {
    const res = await fetchFn(path, { signal: AbortSignal.timeout(12_000) });
    if (!res.ok) return null;
    const data = await res.json();
    return data;
  } catch {
    return null;
  }
}

async function runIntelPolicy(fetchFn: typeof fetch, pair: string, timeframe: string) {
  const token = pair.split('/')[0] ?? 'BTC';

  const [newsRes, eventsRes, flowRes, trendingRes, picksRes] = await Promise.all([
    fetchJsonSafe(
      fetchFn,
      `/api/market/news?limit=40&offset=0&token=${encodeURIComponent(token)}&sort=importance&interval=1m`,
    ),
    fetchJsonSafe(fetchFn, `/api/market/events?pair=${encodeURIComponent(pair)}&timeframe=${encodeURIComponent(timeframe)}`),
    fetchJsonSafe(fetchFn, `/api/market/flow?pair=${encodeURIComponent(pair)}&timeframe=${encodeURIComponent(timeframe)}`),
    fetchJsonSafe(fetchFn, '/api/market/trending?section=all&limit=20'),
    fetchJsonSafe(fetchFn, '/api/terminal/opportunity-scan?limit=15'),
  ]);

  const newsRecords = Array.isArray(newsRes?.data?.records) ? newsRes.data.records : [];
  const eventRecords = Array.isArray(eventsRes?.data?.records) ? eventsRes.data.records : [];
  const flowSnapshot = flowRes?.data?.snapshot ?? null;
  const flowRecords = Array.isArray(flowRes?.data?.records) ? flowRes.data.records : [];
  const trendingCoins = Array.isArray(trendingRes?.data?.trending) ? trendingRes.data.trending : [];
  const pickCoins = Array.isArray(picksRes?.data?.coins) ? picksRes.data.coins : [];

  return buildIntelPolicyOutput({
    pair,
    timeframe,
    newsRecords,
    eventRecords,
    flowSnapshot,
    flowRecords,
    trendingCoins,
    pickCoins,
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

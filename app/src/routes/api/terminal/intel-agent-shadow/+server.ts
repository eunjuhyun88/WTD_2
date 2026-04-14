import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { normalizePair, normalizeTimeframe } from '$lib/server/marketFeedService';
import { buildShadowAgentDecision, type ShadowAgentDecision } from '$lib/server/intelShadowAgent';
import type { IntelPolicyOutput } from '$lib/server/intelPolicyRuntime';
import { getLLMRuntimeStatus, type LLMRuntimeStatus } from '$lib/server/llmService';
import { buildPublicCacheHeaders } from '$lib/server/publicCacheHeaders';
import { createSharedPublicRouteCache } from '$lib/server/publicRouteCache';
import { intelShadowLimiter, intelShadowRefreshLimiter } from '$lib/server/rateLimit';
import { runIpRateLimitGuard } from '$lib/server/authSecurity';

const CACHE_TTL_MS = 20_000;

type ShadowCacheEntry = {
  createdAt: number;
  payload: {
    pair: string;
    timeframe: string;
    policy: IntelPolicyOutput;
    shadow: ShadowAgentDecision;
    llm: LLMRuntimeStatus;
    execution: {
      enabled: boolean;
    };
  };
};

const cache = createSharedPublicRouteCache<ShadowCacheEntry['payload']>({
  scope: 'terminal:intel-shadow',
  ttlMs: CACHE_TTL_MS,
});

function cacheKey(pair: string, timeframe: string): string {
  return `${pair}:${timeframe}`;
}

async function fetchPolicy(fetchFn: typeof fetch, pair: string, timeframe: string): Promise<IntelPolicyOutput> {
  const qs = new URLSearchParams({
    pair,
    timeframe,
  });

  const res = await fetchFn(`/api/terminal/intel-policy?${qs.toString()}`, {
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) throw new Error(`intel-policy upstream failed: ${res.status}`);
  const payload = await res.json();
  if (!payload?.ok || !payload?.data) throw new Error('intel-policy upstream payload invalid');
  return payload.data as IntelPolicyOutput;
}

async function buildPayload(fetchFn: typeof fetch, pair: string, timeframe: string) {
  const policy = await fetchPolicy(fetchFn, pair, timeframe);
  const shadow = await buildShadowAgentDecision(policy);
  const llm = getLLMRuntimeStatus();
  const executionEnabled = String(env.INTEL_SHADOW_EXECUTION_ENABLED ?? '').toLowerCase() === 'true';
  return {
    pair,
    timeframe,
    policy,
    shadow,
    llm,
    execution: {
      enabled: executionEnabled,
    },
  };
}

export const GET: RequestHandler = async ({ fetch, url, request, getClientAddress }) => {
  try {
    const pair = normalizePair(url.searchParams.get('pair'));
    const timeframe = normalizeTimeframe(url.searchParams.get('timeframe'));
    const refresh = url.searchParams.get('refresh') === '1';
    const guard = await runIpRateLimitGuard({
      request,
      fallbackIp: getClientAddress(),
      limiter: refresh ? intelShadowRefreshLimiter : intelShadowLimiter,
      scope: refresh ? 'terminal:intel-shadow:refresh' : 'terminal:intel-shadow',
      max: refresh ? 4 : 12,
      tooManyMessage: refresh
        ? 'Too many shadow refresh requests. Please wait.'
        : 'Too many shadow intel requests. Please wait.',
    });
    if (!guard.ok) return guard.response;
    const key = cacheKey(pair, timeframe);
    const { payload, cacheStatus } = await cache.run(
      key,
      () => buildPayload(fetch, pair, timeframe),
      { bypassCache: refresh },
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
      return json({ error: error.message }, { status: 400 });
    }
    if (typeof error?.message === 'string' && error.message.includes('timeframe must be one of')) {
      return json({ error: error.message }, { status: 400 });
    }

    console.error('[api/terminal/intel-agent-shadow] error:', error);
    return json(
      {
        ok: false,
        error: 'Failed to build shadow agent decision',
      },
      { status: 500 },
    );
  }
};

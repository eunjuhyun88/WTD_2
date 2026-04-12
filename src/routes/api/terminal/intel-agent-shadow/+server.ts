import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { normalizePair, normalizeTimeframe } from '$lib/server/marketFeedService';
import { buildShadowAgentDecision, type ShadowAgentDecision } from '$lib/server/intelShadowAgent';
import type { IntelPolicyOutput } from '$lib/server/intelPolicyRuntime';
import { getLLMRuntimeStatus, type LLMRuntimeStatus } from '$lib/server/llmService';
import { intelShadowLimiter, intelShadowRefreshLimiter } from '$lib/server/rateLimit';
import { runIpRateLimitGuard } from '$lib/server/authSecurity';
import { getSharedCache, setSharedCache } from '$lib/server/sharedCache';

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

const cache = new Map<string, ShadowCacheEntry>();
const inflight = new Map<string, Promise<ShadowCacheEntry['payload']>>();

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

async function getCachedPayload(key: string) {
  const local = cache.get(key);
  if (local && Date.now() - local.createdAt < CACHE_TTL_MS) {
    return local.payload;
  }

  const shared = await getSharedCache<ShadowCacheEntry['payload']>('terminal:intel-shadow', key);
  if (!shared) return null;
  cache.set(key, { createdAt: Date.now(), payload: shared });
  return shared;
}

async function persistPayload(key: string, payload: ShadowCacheEntry['payload']) {
  cache.set(key, { createdAt: Date.now(), payload });
  await setSharedCache('terminal:intel-shadow', key, payload, CACHE_TTL_MS);
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

    if (!refresh) {
      const cachedPayload = await getCachedPayload(key);
      if (cachedPayload) {
        return json(
          {
            ok: true,
            data: cachedPayload,
            cached: true,
          },
          {
            headers: {
              'Cache-Control': 'public, max-age=15, s-maxage=20, stale-while-revalidate=30',
            },
          },
        );
      }
    }

    const inProgress = inflight.get(key);
    if (inProgress) {
      const payload = await inProgress;
      return json(
        {
          ok: true,
          data: payload,
          cached: false,
          coalesced: true,
        },
        {
          headers: {
            'Cache-Control': 'public, max-age=15, s-maxage=20, stale-while-revalidate=30',
          },
        },
      );
    }

    const job = buildPayload(fetch, pair, timeframe)
      .then(async (payload) => {
        await persistPayload(key, payload);
        return payload;
      })
      .finally(() => {
        inflight.delete(key);
      });

    inflight.set(key, job);
    const payload = await job;

    return json(
      {
        ok: true,
        data: payload,
        cached: false,
      },
      {
        headers: {
          'Cache-Control': 'public, max-age=15, s-maxage=20, stale-while-revalidate=30',
        },
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

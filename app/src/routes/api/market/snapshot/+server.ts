import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { Cookies } from '@sveltejs/kit';
import { collectMarketSnapshot, collectPublicMarketSnapshot, type PublicMarketSnapshotResult } from '$lib/server/marketSnapshotService';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { normalizePair, normalizeTimeframe } from '$lib/server/marketFeedService';
import { marketSnapshotLimiter } from '$lib/server/rateLimit';
import { runIpRateLimitGuard } from '$lib/server/authSecurity';
import { buildPublicCacheHeaders } from '$lib/server/publicCacheHeaders';
import { createSharedPublicRouteCache, type PublicRouteCacheStatus } from '$lib/server/publicRouteCache';
import { isRequestBodyTooLargeError, readJsonBody } from '$lib/server/requestGuards';

type MarketSnapshotResult = Awaited<ReturnType<typeof collectMarketSnapshot>>;
type PublicSnapshotResult = PublicMarketSnapshotResult;
type MarketSnapshotSuccessPayload = ReturnType<typeof buildSuccessPayload>;

const PUBLIC_CACHE_TTL_MS = 30_000;

const publicMarketSnapshotCache = createSharedPublicRouteCache<MarketSnapshotSuccessPayload>({
  scope: 'market:snapshot',
  ttlMs: PUBLIC_CACHE_TTL_MS,
});

function toValidationMessage(error: any): string | null {
  const message = typeof error?.message === 'string' ? error.message : '';
  if (message.includes('pair must be like')) return message;
  if (message.includes('timeframe must be one of')) return message;
  return null;
}

function toPersistFlag(value: unknown, fallback = true): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const raw = value.trim().toLowerCase();
    if (!raw) return fallback;
    return !(raw === '0' || raw === 'false' || raw === 'no' || raw === 'off');
  }
  return fallback;
}

function buildSuccessPayload(snapshot: MarketSnapshotResult | PublicSnapshotResult) {
  const atIso = new Date(snapshot.at).toISOString();
  return {
    success: true as const,
    ok: true as const,
    updated: snapshot.updated,
    pair: snapshot.pair,
    timeframe: snapshot.timeframe,
    at: snapshot.at,
    persisted: snapshot.persisted,
    warning: snapshot.warning,
    sources: snapshot.sources,
    data: {
      updated: snapshot.updated,
      pair: snapshot.pair,
      timeframe: snapshot.timeframe,
      at: atIso,
      persisted: snapshot.persisted,
      warning: snapshot.warning,
      sources: snapshot.sources,
    },
  };
}

function buildPublicSnapshotCacheKey(pair: string, timeframe: string): string {
  return `${pair}:${timeframe}`;
}

function noStoreHeaders(): Record<string, string> {
  return {
    'Cache-Control': 'no-store',
  };
}

function publicSuccessResponse(payload: MarketSnapshotSuccessPayload, cacheStatus: PublicRouteCacheStatus) {
  return json(payload, {
    headers: {
      ...buildPublicCacheHeaders({
        browserMaxAge: 15,
        sharedMaxAge: 30,
        staleWhileRevalidate: 30,
        cacheStatus,
      }),
    },
  });
}

function privateSuccessResponse(snapshot: MarketSnapshotResult) {
  return json(buildSuccessPayload(snapshot), {
    headers: noStoreHeaders(),
  });
}

function errorResponse(error: any, method: 'get' | 'post') {
  if (isRequestBodyTooLargeError(error)) {
    return json({ error: 'Request body too large' }, { status: 413, headers: noStoreHeaders() });
  }
  const validationMessage = toValidationMessage(error);
  if (validationMessage) return json({ error: validationMessage }, { status: 400, headers: noStoreHeaders() });
  console.error(`[market/snapshot/${method}] unexpected error:`, error);
  return json({ error: 'Failed to build market snapshot' }, { status: 500, headers: noStoreHeaders() });
}

async function isAuthenticated(cookies: Cookies): Promise<boolean> {
  try {
    const user = await getAuthUserFromCookies(cookies);
    return Boolean(user);
  } catch {
    return false;
  }
}

export const GET: RequestHandler = async ({ fetch, url, cookies, getClientAddress, request }) => {
  const fallbackIp = getClientAddress();
  const guard = await runIpRateLimitGuard({
    request,
    fallbackIp,
    limiter: marketSnapshotLimiter,
    scope: 'market:snapshot:get',
    max: 20,
    tooManyMessage: 'Too many snapshot requests. Please wait.',
  });
  if (!guard.ok) return guard.response;

  try {
    const pair = normalizePair(url.searchParams.get('pair'));
    const timeframe = normalizeTimeframe(url.searchParams.get('timeframe'));
    const { payload, cacheStatus } = await publicMarketSnapshotCache.run(
      buildPublicSnapshotCacheKey(pair, timeframe),
      async () => buildSuccessPayload(await collectPublicMarketSnapshot(fetch, { pair, timeframe })),
    );
    return publicSuccessResponse(payload, cacheStatus);
  } catch (error: any) {
    return errorResponse(error, 'get');
  }
};

export const POST: RequestHandler = async ({ fetch, request, cookies, getClientAddress }) => {
  const fallbackIp = getClientAddress();
  const guard = await runIpRateLimitGuard({
    request,
    fallbackIp,
    limiter: marketSnapshotLimiter,
    scope: 'market:snapshot:post',
    max: 20,
    tooManyMessage: 'Too many snapshot requests. Please wait.',
  });
  if (!guard.ok) return guard.response;

  try {
    const body = await readJsonBody<Record<string, unknown>>(request, 16 * 1024);
    const pair = normalizePair(typeof body?.pair === 'string' ? body.pair : null);
    const timeframe = normalizeTimeframe(typeof body?.timeframe === 'string' ? body.timeframe : null);
    const authenticated = await isAuthenticated(cookies);
    const requestedPersist = toPersistFlag(body?.persist, true);
    const persist = requestedPersist && authenticated;

    const snapshot = await collectMarketSnapshot(fetch, { pair, timeframe, persist });
    return privateSuccessResponse(snapshot);
  } catch (error: any) {
    return errorResponse(error, 'post');
  }
};

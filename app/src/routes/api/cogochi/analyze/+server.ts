import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { randomUUID } from 'node:crypto';
import { EngineError } from '$lib/server/engineClient';
import { runIpRateLimitGuard } from '$lib/server/authSecurity';
import { buildPublicCacheHeaders } from '$lib/server/publicCacheHeaders';
import { parseAnalyzeRequest } from '$lib/server/analyze/requestParser';
import {
  attachAnalyzeRequestMeta,
  buildAnalyzeTraceHeaders,
  createAnalyzeErrorEnvelope,
} from '$lib/server/analyze/responseEnvelope';
import { logAnalyzeRouteEvent } from '$lib/server/analyze/telemetry';
import { analyzeLimiter } from '$lib/server/rateLimit';
import { AnalyzeRouteError, getAnalyzePayload } from '$lib/server/analyze/service';
import { getRequestIp } from '$lib/server/requestIp';

export const GET: RequestHandler = async ({ url, request, getClientAddress }) => {
  const { symbol, tf, from, to } = parseAnalyzeRequest(url);
  const requestId = request.headers.get('x-request-id') ?? randomUUID();
  const fallbackIp = getRequestIp({ request, getClientAddress });
  const guard = await runIpRateLimitGuard({
    request,
    fallbackIp,
    limiter: analyzeLimiter,
    scope: 'cogochi:analyze',
    max: 18,
    tooManyMessage: 'Too many analyze requests. Please retry shortly.',
    allowDistributedInfraFallback: true,
  });

  if (!guard.ok) {
    const reason = await readErrorReasonFromResponse(
      guard.response,
      guard.response.status === 429
        ? 'Too many analyze requests. Please retry shortly.'
        : 'Request blocked by security policy',
    );
    const error = guard.response.status === 429 ? 'rate_limited' : 'request_blocked';
    logAnalyzeRouteEvent({
      event: 'blocked',
      requestId,
      symbol,
      tf,
      status: guard.response.status,
      error,
      reason,
    });
    return json(
      createAnalyzeErrorEnvelope({
        requestId,
        error,
        reason,
        status: guard.response.status,
        upstream: 'security',
      }),
      {
        status: guard.response.status,
        headers: {
          ...buildAnalyzeTraceHeaders({ requestId }),
          'cache-control': 'private, no-store',
        },
      },
    );
  }

  try {
    const { payload, cacheStatus } = await getAnalyzePayload({ symbol, tf, requestId, from, to });
    const responsePayload = attachAnalyzeRequestMeta(payload, { requestId, cacheStatus });
    logAnalyzeRouteEvent({
      event: cacheStatus === 'bypass' ? 'fallback' : 'success',
      requestId,
      symbol,
      tf,
      status: 200,
      cacheStatus,
      payload: responsePayload,
    });

    if (cacheStatus === 'bypass') {
      return json(responsePayload, {
        headers: {
          ...buildAnalyzeTraceHeaders({
            requestId,
            cacheStatus,
            payload: responsePayload,
          }),
          'cache-control': 'private, no-store',
        },
      });
    }

    return json(responsePayload, {
      headers: buildPublicCacheHeaders({
        browserMaxAge: 5,
        sharedMaxAge: 7,
        staleWhileRevalidate: 10,
        cacheStatus,
        headers: buildAnalyzeTraceHeaders({
          requestId,
          cacheStatus,
          payload: responsePayload,
        }),
      }),
    });
  } catch (error: unknown) {
    if (error instanceof AnalyzeRouteError) {
      const errorCode = error.status === 400 ? 'invalid_request' : 'analysis_failed';
      logAnalyzeRouteEvent({
        event: 'error',
        requestId,
        symbol,
        tf,
        status: error.status,
        error: errorCode,
        reason: error.message,
      });
      return json(
        createAnalyzeErrorEnvelope({
          requestId,
          error: errorCode,
          reason: error.message,
          status: error.status,
          upstream: 'route',
        }),
        {
          status: error.status,
          headers: {
            ...buildAnalyzeTraceHeaders({ requestId }),
            'cache-control': 'private, no-store',
          },
        },
      );
    }

    if (error instanceof EngineError) {
      logAnalyzeRouteEvent({
        event: 'error',
        requestId,
        symbol,
        tf,
        status: error.status,
        error: 'upstream_error',
        reason: 'engine error',
      });
      console.error('[cogochi/analyze] EngineError:', error.message);
      return json(
        createAnalyzeErrorEnvelope({
          requestId,
          error: 'upstream_error',
          reason: 'engine error',
          status: error.status,
          upstream: 'engine',
        }),
        {
          status: error.status,
          headers: {
            ...buildAnalyzeTraceHeaders({ requestId }),
            'cache-control': 'private, no-store',
          },
        },
      );
    }

    console.error('[cogochi/analyze] unexpected error:', error);
    logAnalyzeRouteEvent({
      event: 'error',
      requestId,
      symbol,
      tf,
      status: 500,
      error: 'analysis_failed',
      reason: 'Analysis failed',
    });
    return json(
      createAnalyzeErrorEnvelope({
        requestId,
        error: 'analysis_failed',
        reason: 'Analysis failed',
        status: 500,
        upstream: 'route',
      }),
      {
        status: 500,
        headers: {
          ...buildAnalyzeTraceHeaders({ requestId }),
          'cache-control': 'private, no-store',
        },
      },
    );
  }
};

async function readErrorReasonFromResponse(base: Response, fallback: string): Promise<string> {
  try {
    const body = (await base.clone().json()) as { error?: unknown; reason?: unknown };
    if (typeof body.reason === 'string' && body.reason.trim().length > 0) return body.reason;
    if (typeof body.error === 'string' && body.error.trim().length > 0) return body.error;
  } catch {
    // ignore parse failures and use fallback
  }
  return fallback;
}

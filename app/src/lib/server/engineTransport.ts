import { env } from '$env/dynamic/private';
import * as Sentry from '@sentry/sveltekit';
import { engineCache } from './engineCache';

export const ENGINE_URL = (env.ENGINE_URL ?? 'http://localhost:8000').replace(/\/$/, '');

function engineInternalSecret(): string {
  return env.ENGINE_INTERNAL_SECRET?.trim() ?? '';
}

export function buildEngineHeaders(headers?: HeadersInit): Headers {
  const next = new Headers(headers);
  const secret = engineInternalSecret();
  if (secret) next.set('x-engine-internal-secret', secret);

  // Add Sentry tracing headers for distributed tracing app → engine
  const traceparent = Sentry.getActiveSpan()?.spanContext()?.traceId;
  if (traceparent) {
    next.set('traceparent', traceparent);
  }

  return next;
}

export async function engineFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const method = init.method?.toUpperCase() ?? 'GET';
  const cacheKey = `engine:${method}:${path}`;

  // Only cache GET requests for deterministic read-path
  if (method === 'GET') {
    const cached = await engineCache.get(cacheKey);
    if (cached) {
      return new Response(JSON.stringify(cached), {
        headers: { 'content-type': 'application/json', 'x-cache': 'HIT' },
      });
    }
  }

  const res = await fetch(`${ENGINE_URL}${path}`, {
    ...init,
    headers: buildEngineHeaders(init.headers),
  });

  // Cache successful GET responses
  if (method === 'GET' && res.ok) {
    try {
      const text = await res.clone().text();
      const json = JSON.parse(text) as unknown;
      await engineCache.set(cacheKey, json);
      return new Response(text, {
        status: res.status,
        headers: { ...Object.fromEntries(res.headers), 'x-cache': 'MISS' },
      });
    } catch (err) {
      console.error('[engineFetch] cache error:', err);
      return res;
    }
  }

  // Invalidate cache on write operations
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    await engineCache.invalidate(path.split('/')[0] ?? '');
  }

  return res;
}

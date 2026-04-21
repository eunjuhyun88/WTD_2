import { env } from '$env/dynamic/private';

export const ENGINE_URL = (env.ENGINE_URL ?? 'http://localhost:8000').replace(/\/$/, '');

function engineInternalSecret(): string {
  return env.ENGINE_INTERNAL_SECRET?.trim() ?? '';
}

export function buildEngineHeaders(headers?: HeadersInit): Headers {
  const next = new Headers(headers);
  const secret = engineInternalSecret();
  if (secret) next.set('x-engine-internal-secret', secret);
  return next;
}

export function engineFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${ENGINE_URL}${path}`, {
    ...init,
    headers: buildEngineHeaders(init.headers),
  });
}

/**
 * SvelteKit proxy → Python engine (FastAPI).
 *
 * Routes all /api/engine/* requests to ENGINE_URL.
 * This keeps the Python engine behind the SvelteKit server:
 *   - CORS handled once at SvelteKit layer
 *   - ENGINE_URL never exposed to the browser
 *   - Auth can be added here before forwarding
 *
 * Examples:
 *   POST /api/engine/score          → POST http://engine:8000/score
 *   POST /api/engine/backtest       → POST http://engine:8000/backtest
 *   POST /api/engine/challenge/create → POST http://engine:8000/challenge/create
 *   GET  /api/engine/challenge/foo/scan → GET http://engine:8000/challenge/foo/scan
 *   GET  /api/engine/healthz        → GET http://engine:8000/healthz
 *
 * Legacy note:
 *   New fact/search/runtime traffic must use `/api/facts/*`, `/api/search/*`,
 *   or `/api/runtime/*`. Keep this route frozen as a compatibility bridge.
 */

import { error, json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { engineProxyLimiterDistributed } from '$lib/server/distributedRateLimit';
import { ENGINE_URL, buildEngineHeaders } from '$lib/server/engineTransport';

// PUT/DELETE are not currently permitted on the engine proxy
function isBlockedPath(path: string): boolean {
  return path === 'patterns/states' || path.startsWith('patterns/states/') || path === 'captures' || path.startsWith('captures/');
}

function isAllowedPath(path: string, method: string): boolean {
  if (isBlockedPath(path)) return false;
  if (method === 'GET') {
    return (
      path === 'healthz' ||
      path.startsWith('memory/') ||
      path === 'scanner/status' ||
      path === 'patterns/candidates' ||
      path === 'universe' ||
      path.startsWith('challenge/')
    );
  }
  if (method === 'POST') {
    const first = path.split('/')[0];
    return (
      ['score', 'deep', 'backtest', 'train', 'opportunity', 'verdict'].includes(first) ||
      path.startsWith('memory/') ||
      path.startsWith('challenge/')
    );
  }
  return false;
}

export const config = {
  runtime: 'nodejs22.x',
  regions: ['iad1'],
  memory: 1024,
  maxDuration: 90,
};

function timeoutFor(path: string, method: string): number {
  if (method === 'GET') {
    if (path === 'healthz') return 2_000;
    if (path.startsWith('memory/')) return 5_000;
    return 10_000;
  }
  if (path.startsWith('backtest') || path.includes('challenge') || path.startsWith('lab/')) {
    return 60_000;
  }
  if (path.startsWith('memory/feedback')) return 5_000;
  return 30_000;
}

async function proxy(request: Request, path: string): Promise<Response> {
  const query = new URL(request.url).search;
  const url = `${ENGINE_URL}/${path}${query}`;
  const controller = new AbortController();
  const timeoutMs = timeoutFor(path, request.method);
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers = buildEngineHeaders();
    const contentType = request.headers.get('content-type');
    if (contentType) headers.set('content-type', contentType);

    const body = request.method !== 'GET' && request.method !== 'HEAD'
      ? await request.arrayBuffer()
      : undefined;

    const upstream = await fetch(url, {
      method: request.method,
      headers,
      body,
      signal: controller.signal,
    });

    // Stream the response back as-is.
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        'content-type': upstream.headers.get('content-type') ?? 'application/json',
      },
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw error(504, `Engine timed out after ${timeoutMs}ms (path: ${path})`);
    }
    throw error(502, `Engine unreachable: ${(err as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
}

const HEAVY_ENGINE_PATHS = new Set(['score', 'deep', 'backtest', 'train', 'opportunity']);

function isHeavyPath(path: string): boolean {
  const first = path.split('/')[0];
  return HEAVY_ENGINE_PATHS.has(first);
}

export const GET: RequestHandler = ({ request, params }) => {
  if (!isAllowedPath(params.path, 'GET')) {
    return json({ error: 'Not found' }, { status: 404 });
  }
  return proxy(request, params.path);
};

export const POST: RequestHandler = async ({ request, params, getClientAddress }) => {
  if (!isAllowedPath(params.path, 'POST')) {
    return json({ error: 'Not found' }, { status: 404 });
  }
  if (isHeavyPath(params.path) && !(await engineProxyLimiterDistributed.check(getClientAddress()))) {
    return json({ error: 'Too many requests' }, { status: 429 });
  }
  return proxy(request, params.path);
};

export const PUT: RequestHandler = ({ request, params }) => {
  if (isBlockedPath(params.path) || !isAllowedPath(params.path, 'PUT')) {
    return json({ error: 'Not found' }, { status: 404 });
  }
  return proxy(request, params.path);
};

export const DELETE: RequestHandler = ({ request, params }) => {
  if (isBlockedPath(params.path) || !isAllowedPath(params.path, 'DELETE')) {
    return json({ error: 'Not found' }, { status: 404 });
  }
  return proxy(request, params.path);
};

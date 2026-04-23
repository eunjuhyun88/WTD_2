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
 */

import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ENGINE_URL, buildEngineHeaders } from '$lib/server/engineTransport';
import { engineProxyLimiter } from '$lib/server/rateLimit';

const HEAVY_ENGINE_PATHS = new Set(['score', 'deep', 'backtest', 'train', 'opportunity']);
const BLOCKED_ENGINE_PATHS = new Set(['docs', 'redoc', 'openapi.json', 'metrics']);
type EngineProxyMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

type EngineProxyRule = {
  pattern: RegExp;
  methods: ReadonlySet<EngineProxyMethod>;
};

const ENGINE_PROXY_RULES: EngineProxyRule[] = [
  { pattern: /^healthz$/, methods: new Set(['GET']) },
  { pattern: /^ctx\/fact$/, methods: new Set(['GET']) },
  { pattern: /^patterns\/candidates$/, methods: new Set(['GET']) },
  { pattern: /^scanner\/status$/, methods: new Set(['GET']) },
  { pattern: /^universe$/, methods: new Set(['GET']) },
  { pattern: /^memory\/query$/, methods: new Set(['POST']) },
  { pattern: /^memory\/feedback\/batch$/, methods: new Set(['POST']) },
  { pattern: /^memory\/debug-session$/, methods: new Set(['POST']) },
];

function isHeavyPath(path: string): boolean {
  return HEAVY_ENGINE_PATHS.has(path.split('/')[0]);
}

function isBlockedPath(path: string): boolean {
  return BLOCKED_ENGINE_PATHS.has(path.toLowerCase().split('/')[0]);
}

function normalizeProxyPath(path: string): string {
  return path.replace(/^\/+/, '').replace(/\/+$/, '');
}

function isAllowedPath(path: string, method: EngineProxyMethod): boolean {
  const normalizedPath = normalizeProxyPath(path);
  return ENGINE_PROXY_RULES.some((rule) => rule.methods.has(method) && rule.pattern.test(normalizedPath));
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

export const GET: RequestHandler = ({ request, params }) => {
  if (isBlockedPath(params.path) || !isAllowedPath(params.path, 'GET')) {
    return json({ error: 'Not found' }, { status: 404 });
  }
  return proxy(request, params.path);
};

export const POST: RequestHandler = ({ request, params, getClientAddress }) => {
  if (isBlockedPath(params.path) || !isAllowedPath(params.path, 'POST')) {
    return json({ error: 'Not found' }, { status: 404 });
  }
  if (isHeavyPath(params.path) && !engineProxyLimiter.check(getClientAddress())) {
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

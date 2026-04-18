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

import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

export const config = {
  runtime: 'nodejs22.x',
  regions: ['iad1'],
  memory: 1024,
  maxDuration: 90,
};

const ENGINE_URL = (env.ENGINE_URL ?? 'http://localhost:8000').replace(/\/$/, '');

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
    const headers = new Headers();
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

export const GET: RequestHandler = ({ request, params }) =>
  proxy(request, params.path);

export const POST: RequestHandler = ({ request, params }) =>
  proxy(request, params.path);

export const PUT: RequestHandler = ({ request, params }) =>
  proxy(request, params.path);

export const DELETE: RequestHandler = ({ request, params }) =>
  proxy(request, params.path);

/**
 * GET /api/captures/outcomes
 *
 * Verdict Inbox — resolved captures awaiting user verdict.
 * Proxies to engine GET /captures/outcomes.
 *
 * Query params:
 *   user_id      — filter by user (optional)
 *   pattern_slug — filter by pattern (optional)
 *   symbol       — filter by symbol (optional)
 *   status       — 'outcome_ready' | 'verdict_ready' (default: outcome_ready)
 *   limit        — max rows (default 100)
 */

import { env } from '$env/dynamic/private';
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAuthUserFromCookies } from '$lib/server/authGuard';

export const config = {
  runtime: 'nodejs22.x',
  regions: ['iad1'],
  memory: 256,
  maxDuration: 15,
};

const ENGINE_URL = (env.ENGINE_URL ?? 'http://localhost:8000').replace(/\/$/, '');

export const GET: RequestHandler = async ({ url, cookies }) => {
  const user = await getAuthUserFromCookies(cookies);
  if (!user) throw error(401, 'Authentication required');

  const params = new URLSearchParams();
  params.set('user_id', user.id);

  const symbol = url.searchParams.get('symbol');
  const patternSlug = url.searchParams.get('pattern_slug');
  const status = url.searchParams.get('status') ?? 'outcome_ready';
  const limit = url.searchParams.get('limit') ?? '100';

  if (symbol) params.set('symbol', symbol);
  if (patternSlug) params.set('pattern_slug', patternSlug);
  params.set('status', status);
  params.set('limit', limit);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);

  try {
    const res = await fetch(`${ENGINE_URL}/captures/outcomes?${params}`, {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: controller.signal,
    });
    const body = await res.text();
    return new Response(body, {
      status: res.status,
      headers: {
        'content-type': res.headers.get('content-type') ?? 'application/json',
        'cache-control': 'private, no-store',
      },
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw error(504, 'engine captures/outcomes timeout');
    throw error(502, 'engine captures/outcomes unavailable');
  } finally {
    clearTimeout(timeout);
  }
};

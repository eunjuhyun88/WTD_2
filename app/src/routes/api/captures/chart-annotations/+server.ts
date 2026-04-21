/**
 * GET /api/captures/chart-annotations
 *
 * Authenticated TradingView annotation feed for capture markers.
 * Proxies to engine GET /captures/chart-annotations.
 */

import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { engineFetch } from '$lib/server/engineTransport';
import { getAuthUserFromCookies } from '$lib/server/authGuard';

export const GET: RequestHandler = async ({ url, cookies }) => {
  const user = await getAuthUserFromCookies(cookies);
  if (!user) throw error(401, 'Authentication required');

  const params = new URLSearchParams();
  params.set('user_id', user.id);
  const symbol = url.searchParams.get('symbol');
  const timeframe = url.searchParams.get('timeframe');
  const limit = url.searchParams.get('limit') ?? '50';

  if (symbol) params.set('symbol', symbol);
  if (timeframe) params.set('timeframe', timeframe);
  params.set('limit', limit);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);

  try {
    const res = await engineFetch(`/captures/chart-annotations?${params.toString()}`, {
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
    if ((err as Error).name === 'AbortError') throw error(504, 'engine chart annotations timeout');
    throw error(502, 'engine chart annotations unavailable');
  } finally {
    clearTimeout(timeout);
  }
};

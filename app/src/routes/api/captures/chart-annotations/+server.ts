/**
 * GET /api/captures/chart-annotations
 *
 * Authenticated TradingView annotation feed for capture markers.
 * Proxies to engine GET /captures/chart-annotations.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { engineFetch } from '$lib/server/engineTransport';
import { getAuthUserFromCookies } from '$lib/server/authGuard';

export const GET: RequestHandler = async ({ url, cookies }) => {
  const user = await getAuthUserFromCookies(cookies);
  if (!user) {
    return json({ annotations: [], total: 0, unauthenticated: true }, {
      headers: { 'cache-control': 'private, no-store' },
    });
  }

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
    if (!res.ok) {
      return json({ annotations: [], total: 0, degraded: true, reason: `upstream_${res.status}` }, {
        headers: { 'cache-control': 'private, no-store' },
      });
    }
    const body = await res.text();
    return new Response(body, {
      status: res.status,
      headers: {
        'content-type': res.headers.get('content-type') ?? 'application/json',
        'cache-control': 'private, no-store',
      },
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      return json({ annotations: [], total: 0, degraded: true, reason: 'timeout' }, {
        headers: { 'cache-control': 'private, no-store' },
      });
    }
    return json({ annotations: [], total: 0, degraded: true, reason: 'unavailable' }, {
      headers: { 'cache-control': 'private, no-store' },
    });
  } finally {
    clearTimeout(timeout);
  }
};

/**
 * GET  /api/captures?limit=N            — list recent captures for the current user
 * POST /api/captures                    — create a new capture
 *
 * Compatibility surface that now proxies to engine /runtime/captures while
 * deriving user_id from session.
 */

import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { engineFetch } from '$lib/server/engineTransport';
import { getAuthUserFromCookies } from '$lib/server/authGuard';

export const GET: RequestHandler = async ({ url, cookies }) => {
  const user = await getAuthUserFromCookies(cookies);
  if (!user) return json({ ok: false, captures: [], count: 0 });

  const limit = Math.min(Number(url.searchParams.get('limit') || '20'), 100);
  const symbol = url.searchParams.get('symbol') ?? '';
  const watching = url.searchParams.get('watching');
  const params = new URLSearchParams({ user_id: user.id, limit: String(limit) });
  if (symbol) params.set('symbol', symbol);
  if (watching) params.set('watching', watching);

  try {
    const res = await engineFetch(`/runtime/captures?${params}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return json({ ok: false, captures: [], count: 0 });
    return json(await res.json());
  } catch {
    return json({ ok: false, captures: [], count: 0 });
  }
};

export const POST: RequestHandler = async ({ request, cookies }) => {
  const user = await getAuthUserFromCookies(cookies);
  if (!user) throw error(401, 'Authentication required');

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    throw error(400, 'Invalid JSON body');
  }

  const payload = {
    ...body,
    user_id: user.id,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await engineFetch('/runtime/captures', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const text = await res.text();
    return new Response(text, {
      status: res.status,
      headers: {
        'content-type': res.headers.get('content-type') ?? 'application/json',
      },
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw error(504, 'engine capture timeout');
    throw error(502, 'engine capture unavailable');
  } finally {
    clearTimeout(timeout);
  }
};

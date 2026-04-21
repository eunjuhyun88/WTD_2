/**
 * POST /api/captures
 *
 * Canonical app capture create route.
 * Proxies to engine POST /captures while deriving user_id from session.
 */

import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { engineFetch } from '$lib/server/engineTransport';
import { getAuthUserFromCookies } from '$lib/server/authGuard';

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
    const res = await engineFetch('/captures', {
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

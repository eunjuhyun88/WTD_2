/**
 * GET /api/users/[userId]/f60-status
 * Proxies to engine GET /users/{userId}/f60-status
 */

import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { engineFetch } from '$lib/server/engineTransport';

export const config = {
  runtime: 'nodejs22.x',
  regions: ['iad1'],
  memory: 128,
  maxDuration: 8,
};

export const GET: RequestHandler = async ({ params, cookies }) => {
  const user = await getAuthUserFromCookies(cookies);
  if (!user) throw error(401, 'Authentication required');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6_000);
  try {
    const res = await engineFetch(`/users/${params.userId}/f60-status`, {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: controller.signal,
    });
    const text = await res.text();
    return new Response(text, {
      status: res.status,
      headers: { 'content-type': 'application/json' },
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw error(504, 'engine timeout');
    throw error(502, 'engine unavailable');
  } finally {
    clearTimeout(timeout);
  }
};

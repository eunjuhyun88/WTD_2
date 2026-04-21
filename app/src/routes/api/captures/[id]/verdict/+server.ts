/**
 * POST /api/captures/[id]/verdict
 *
 * Apply user verdict to a resolved capture.
 * Proxies to engine POST /captures/{id}/verdict.
 *
 * Body: { verdict: 'valid' | 'invalid' | 'missed', user_note?: string }
 */

import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { engineFetch } from '$lib/server/engineTransport';

export const config = {
  runtime: 'nodejs22.x',
  regions: ['iad1'],
  memory: 256,
  maxDuration: 10,
};

export const POST: RequestHandler = async ({ params, request, cookies }) => {
  const user = await getAuthUserFromCookies(cookies);
  if (!user) throw error(401, 'Authentication required');

  const { id } = params;
  const body = await request.text();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);

  try {
    const res = await engineFetch(`/captures/${id}/verdict`, {
      method: 'POST',
      headers: {
        'content-type': request.headers.get('content-type') ?? 'application/json',
        accept: 'application/json',
      },
      body,
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
    if ((err as Error).name === 'AbortError') throw error(504, 'engine verdict timeout');
    throw error(502, 'engine verdict unavailable');
  } finally {
    clearTimeout(timeout);
  }
};

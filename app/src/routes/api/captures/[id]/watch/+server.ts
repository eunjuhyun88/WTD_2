/**
 * POST /api/captures/[id]/watch
 *
 * Mark a capture as watching. Idempotent.
 * Proxies to engine POST /captures/{id}/watch.
 *
 * Body: { expiry_hours?: number }
 * Response 200: { capture_id, is_watching, started_watching_at, watch_expires_at }
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
  let payload: Record<string, unknown> = {};
  try {
    const text = await request.text();
    if (text) payload = JSON.parse(text);
  } catch {
    throw error(400, 'Invalid JSON body');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);

  try {
    const res = await engineFetch(`/captures/${id}/watch`, {
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
    if ((err as Error).name === 'AbortError') throw error(504, 'engine watch timeout');
    throw error(502, 'engine watch unavailable');
  } finally {
    clearTimeout(timeout);
  }
};

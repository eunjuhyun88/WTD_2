/**
 * POST /api/patterns/draft-from-range
 *
 * Extract PatternDraft from a chart range (symbol + start_ts + end_ts).
 * Proxies to engine POST /patterns/draft-from-range (A-04-eng PR #372).
 *
 * Body: { symbol, start_ts, end_ts, timeframe? }
 * Response 200: PatternDraftBody + extracted_features dict
 */

import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { engineFetch } from '$lib/server/engineTransport';

export const config = {
  runtime: 'nodejs22.x',
  regions: ['iad1'],
  memory: 256,
  maxDuration: 15,
};

export const POST: RequestHandler = async ({ request, cookies }) => {
  const user = await getAuthUserFromCookies(cookies);
  if (!user) throw error(401, 'Authentication required');

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    throw error(400, 'Invalid JSON body');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);

  try {
    const res = await engineFetch('/patterns/draft-from-range', {
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
    if ((err as Error).name === 'AbortError') throw error(504, 'engine draft timeout');
    throw error(502, 'engine draft unavailable');
  } finally {
    clearTimeout(timeout);
  }
};

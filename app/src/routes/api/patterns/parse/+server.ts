/**
 * POST /api/patterns/parse
 *
 * Parse natural-language memo → PatternDraftBody.
 * Proxies to engine POST /patterns/parse (A-03-eng PR #371, Sonnet 4.6).
 *
 * Body: { text: string, context_hints?: { pattern_family?, symbol? } }
 * Response 200: PatternDraftBody
 */

import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { engineFetch } from '$lib/server/engineTransport';

export const config = {
  runtime: 'nodejs22.x',
  regions: ['iad1'],
  memory: 256,
  // LLM call ~3-5s, allow buffer
  maxDuration: 30,
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

  // Basic validation
  const text = payload.text;
  if (typeof text !== 'string' || text.length === 0) {
    throw error(400, 'text is required');
  }
  if (text.length > 5000) {
    throw error(400, 'text too long (max 5000 chars)');
  }

  const controller = new AbortController();
  // Sonnet 4.6 latency p95 ≤ 4s, retry up to 2x → 12s max
  const timeout = setTimeout(() => controller.abort(), 25_000);

  try {
    const res = await engineFetch('/patterns/parse', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const responseText = await res.text();
    return new Response(responseText, {
      status: res.status,
      headers: {
        'content-type': res.headers.get('content-type') ?? 'application/json',
      },
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw error(504, 'parser timeout');
    throw error(502, 'parser unavailable');
  } finally {
    clearTimeout(timeout);
  }
};

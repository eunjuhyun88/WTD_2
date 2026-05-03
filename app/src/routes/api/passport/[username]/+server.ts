/**
 * GET /api/passport/[username]
 *
 * Public passport stats for a given username.
 * No auth required — returns public data only.
 * Proxies to engine GET /passport/{username}.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { engineFetch } from '$lib/server/engineTransport';

export const config = {
  runtime: 'nodejs22.x',
  regions: ['iad1'],
  memory: 256,
  maxDuration: 10,
};

export const GET: RequestHandler = async ({ params }) => {
  const { username } = params;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);

  try {
    const res = await engineFetch(`/passport/${encodeURIComponent(username)}`, {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: controller.signal,
    });

    const text = await res.text();
    return new Response(text, {
      status: res.status,
      headers: {
        'content-type': res.headers.get('content-type') ?? 'application/json',
        'cache-control': 'public, max-age=60',
      },
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      return json({ detail: 'passport lookup timeout' }, { status: 504 });
    }
    return json({ detail: 'passport service unavailable' }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
};

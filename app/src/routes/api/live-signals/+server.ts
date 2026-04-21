import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { engineFetch } from '$lib/server/engineTransport';

export const config = {
  runtime: 'nodejs22.x',
  regions: ['iad1'],
  memory: 256,
  maxDuration: 30,
  isr: {
    // Scanner cadence is 15 min; 120s cache is sufficient and reduces GCP cold-start pressure
    expiration: 120,
  },
};

export const GET: RequestHandler = async () => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  try {
    const res = await engineFetch('/live-signals', {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: controller.signal,
    });
    const body = await res.text();
    return new Response(body, {
      status: res.status,
      headers: {
        'content-type': res.headers.get('content-type') ?? 'application/json',
        'cache-control': 's-maxage=120, stale-while-revalidate=600',
      },
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw error(504, 'engine live-signals timeout');
    }
    throw error(502, 'engine live-signals unavailable');
  } finally {
    clearTimeout(timeout);
  }
};

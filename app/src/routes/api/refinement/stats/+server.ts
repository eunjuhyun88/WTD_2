import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { engineFetch } from '$lib/server/engineTransport';

export const config = {
  runtime: 'nodejs22.x',
  regions: ['iad1'],
  memory: 256,
  maxDuration: 15,
  isr: {
    expiration: 300,
  },
};

export const GET: RequestHandler = async () => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);

  try {
    const res = await engineFetch('/refinement/stats', {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: controller.signal,
    });
    const body = await res.text();
    return new Response(body, {
      status: res.status,
      headers: {
        'content-type': res.headers.get('content-type') ?? 'application/json',
        'cache-control': 's-maxage=300, stale-while-revalidate=600',
      },
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw error(504, 'engine refinement/stats timeout');
    }
    throw error(502, 'engine refinement/stats unavailable');
  } finally {
    clearTimeout(timeout);
  }
};

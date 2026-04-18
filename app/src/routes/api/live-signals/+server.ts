import { env } from '$env/dynamic/private';
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const config = {
  runtime: 'nodejs22.x',
  regions: ['iad1'],
  memory: 256,
  maxDuration: 30,
  isr: {
    expiration: 60,
  },
};

const ENGINE_URL = (env.ENGINE_URL ?? 'http://localhost:8000').replace(/\/$/, '');

export const GET: RequestHandler = async () => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  try {
    const res = await fetch(`${ENGINE_URL}/live-signals`, {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: controller.signal,
    });
    const body = await res.text();
    return new Response(body, {
      status: res.status,
      headers: {
        'content-type': res.headers.get('content-type') ?? 'application/json',
        'cache-control': 's-maxage=60, stale-while-revalidate=300',
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

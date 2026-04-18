import { env } from '$env/dynamic/private';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const config = {
  runtime: 'nodejs22.x',
  regions: ['iad1'],
  memory: 256,
  maxDuration: 10,
};

const ENGINE_URL = (env.ENGINE_URL ?? 'http://localhost:8000').replace(/\/$/, '');

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.text();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);

  try {
    const res = await fetch(`${ENGINE_URL}/live-signals/verdict`, {
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
    if ((err as Error).name === 'AbortError') {
      throw error(504, 'engine verdict timeout');
    }
    throw error(502, 'engine verdict unavailable');
  } finally {
    clearTimeout(timeout);
  }
};

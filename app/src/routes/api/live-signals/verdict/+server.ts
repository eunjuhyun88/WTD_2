import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { engineFetch } from '$lib/server/engineTransport';

export const config = {
  runtime: 'nodejs22.x',
  regions: ['iad1'],
  memory: 256,
  maxDuration: 10,
};

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.text();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);

  try {
    const res = await engineFetch('/live-signals/verdict', {
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

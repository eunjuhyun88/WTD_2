import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const ENGINE_URL = (env.ENGINE_URL ?? 'http://localhost:8000').replace(/\/$/, '');

export const config = {
  runtime: 'nodejs22.x',
  regions: ['iad1'],
  memory: 256,
  maxDuration: 10,
};

export const GET: RequestHandler = async () => {
  const startedAt = Date.now();
  let engineReady = false;
  let engineStatus = 0;
  const redisConfigured = Boolean(
    env.SHARED_CACHE_REDIS_REST_URL && env.SHARED_CACHE_REDIS_REST_TOKEN && env.RATE_LIMIT_REDIS_REST_URL
  );

  try {
    const res = await fetch(`${ENGINE_URL}/readyz`, {
      method: 'GET',
      headers: { accept: 'application/json' }
    });
    engineStatus = res.status;
    engineReady = res.ok;
  } catch {
    engineReady = false;
  }

  return json(
    {
      ok: engineReady,
      service: 'wtd-app',
      status: engineReady ? 'ready' : 'degraded',
      engine: {
        ready: engineReady,
        status: engineStatus
      },
      redis: {
        configured: redisConfigured
      },
      latency_ms: Date.now() - startedAt,
      at: new Date().toISOString()
    },
    {
      status: engineReady ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' }
    }
  );
};


import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const config = {
  runtime: 'nodejs22.x',
  regions: ['iad1'],
  memory: 128,
  maxDuration: 5,
};

export const GET: RequestHandler = async () => {
  return json(
    {
      ok: true,
      service: 'chatbattle-web',
      status: 'healthy',
      at: new Date().toISOString(),
    },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
};

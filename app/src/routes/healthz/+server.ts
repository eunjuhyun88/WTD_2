import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
  return json(
    {
      ok: true,
      service: 'wtd-app',
      status: 'healthy',
      at: new Date().toISOString()
    },
    {
      headers: { 'Cache-Control': 'no-store' }
    }
  );
};

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { engineFetch } from '$lib/server/engineTransport';

// GET /api/observability/metrics — authenticated proxy for engine /metrics
// Keeps engine runtime metrics off the public internet while still allowing
// logged-in app operators to inspect current counters and latencies.
export const GET: RequestHandler = async ({ cookies }) => {
  const authUser = await getAuthUserFromCookies(cookies);
  if (!authUser) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const res = await engineFetch('/metrics', {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) {
      return json({ error: 'Engine metrics unavailable' }, { status: 502 });
    }
    return json(await res.json(), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return json({ error: 'Engine metrics unavailable' }, { status: 502 });
  }
};

// GET /api/observability/flywheel — proxy for engine /observability/flywheel/health
// Returns the 6 business gate KPIs. Used by the dashboard Flywheel Gate Panel.

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { engineFetch } from '$lib/server/engineTransport';

export const GET: RequestHandler = async () => {
  try {
    const res = await engineFetch('/observability/flywheel/health', {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return json({ ok: false }, { status: 200 });
    const data = await res.json();
    return json({ ok: true, ...data });
  } catch {
    return json({ ok: false });
  }
};

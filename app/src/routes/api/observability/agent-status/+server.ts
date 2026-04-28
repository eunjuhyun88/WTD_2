// GET /api/observability/agent-status — proxy for engine /observability/agent-status
// Returns scheduler jobs + pattern engine state + flywheel KPIs.

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { engineFetch } from '$lib/server/engineTransport';

export const GET: RequestHandler = async () => {
  try {
    const res = await engineFetch('/observability/agent-status', {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return json({ ok: false }, { status: 200 });
    const data = await res.json();
    return json({ ok: true, ...data });
  } catch {
    return json({ ok: false });
  }
};

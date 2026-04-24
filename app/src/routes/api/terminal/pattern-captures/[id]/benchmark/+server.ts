/**
 * POST /api/terminal/pattern-captures/[id]/benchmark
 *
 * Fire-and-forget: trigger engine benchmark_search for a saved capture.
 * Called from ResearchPanel after save — non-blocking, best-effort.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { engineFetch } from '$lib/server/engineTransport';

export const POST: RequestHandler = async ({ cookies, params }) => {
  const user = await getAuthUserFromCookies(cookies);
  if (!user) return json({ error: 'Authentication required' }, { status: 401 });

  const captureId = params.id;
  if (!captureId) return json({ error: 'Missing capture id' }, { status: 400 });

  // Non-blocking: kick off engine benchmark_search, return immediately
  void (async () => {
    try {
      await engineFetch(`/captures/${encodeURIComponent(captureId)}/benchmark_search`, {
        method: 'POST',
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      // Best-effort — failure is non-fatal
    }
  })();

  return json({ ok: true, queued: true });
};

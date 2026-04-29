/**
 * GET /api/dashboard/wvpl?weeks=N
 *
 * Returns rolling weekly WVPL breakdowns for the authenticated user.
 * Source: engine `/metrics/user/{user_id}/wvpl` (live computation from ledger).
 *
 * Design: work/active/W-0305-d2-wvpl-nsm-instrumentation.md
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { engineFetch } from '$lib/server/engineTransport';

const DEFAULT_WEEKS = 4;
const MAX_WEEKS = 52;

export const GET: RequestHandler = async ({ url, cookies }) => {
  const user = await getAuthUserFromCookies(cookies);
  if (!user) {
    return json({ error: 'Authentication required' }, { status: 401 });
  }

  const weeksParam = Number(url.searchParams.get('weeks') ?? DEFAULT_WEEKS);
  const weeks = Number.isFinite(weeksParam)
    ? Math.min(Math.max(Math.trunc(weeksParam), 1), MAX_WEEKS)
    : DEFAULT_WEEKS;

  try {
    const upstream = await engineFetch(
      `/metrics/user/${encodeURIComponent(user.id)}/wvpl?weeks=${weeks}`,
      {
        method: 'GET',
        headers: { 'x-user-id': user.id },
      }
    );

    if (!upstream.ok) {
      const text = await upstream.text();
      throw error(upstream.status, `Engine returned ${upstream.status}: ${text}`);
    }

    return new Response(upstream.body, {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw error(504, 'Engine timed out');
    }
    if ((err as { status?: number }).status) throw err;
    throw error(502, `Engine unreachable: ${(err as Error).message}`);
  }
};

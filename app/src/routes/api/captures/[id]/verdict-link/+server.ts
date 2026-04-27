/**
 * POST /api/captures/:id/verdict-link
 * F-3: Generate a signed 72h deep-link token for Telegram verdict submission.
 * Proxies to engine POST /captures/{id}/verdict-link.
 */
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { engineFetch } from '$lib/server/engineTransport';
import { getAuthUserFromCookies } from '$lib/server/authGuard';

export const POST: RequestHandler = async ({ params, cookies }) => {
  const user = await getAuthUserFromCookies(cookies);
  if (!user) throw error(401, 'Authentication required');

  try {
    const res = await engineFetch(`/captures/${params.id}/verdict-link`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw error(res.status, (body as { detail?: string }).detail ?? 'Engine error');
    }
    return json(await res.json());
  } catch (e) {
    if ((e as { status?: number }).status) throw e;
    throw error(502, 'verdict-link unavailable');
  }
};

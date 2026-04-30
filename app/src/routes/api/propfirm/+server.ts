/**
 * GET /api/propfirm?account_id=&limit=20
 *   Returns { account, recent_fires, open_positions } for PatternRunPanel
 *
 * POST /api/propfirm
 *   Body: { action: 'create_account', exit_policy, strategy_id?, symbols? }
 *   Creates an INTERNAL_RUN trading_accounts row
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { engineFetch } from '$lib/server/engineTransport';

export const GET: RequestHandler = async ({ url, cookies }) => {
  const user = await getAuthUserFromCookies(cookies);
  if (!user) return json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const accountId = url.searchParams.get('account_id') ?? '';
  const limit = Math.min(Number(url.searchParams.get('limit') || '20'), 100);

  const params = new URLSearchParams({ limit: String(limit) });
  if (accountId) params.set('account_id', accountId);
  params.set('user_id', user.id);

  try {
    const res = await engineFetch(`/propfirm/summary?${params}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      return json({ ok: false, error: `engine ${res.status}` }, { status: res.status });
    }
    return json(await res.json());
  } catch (err) {
    return json({ ok: false, error: String(err) }, { status: 500 });
  }
};

export const POST: RequestHandler = async ({ request, cookies }) => {
  const user = await getAuthUserFromCookies(cookies);
  if (!user) return json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();

  try {
    const res = await engineFetch('/propfirm/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, user_id: user.id }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      return json({ ok: false, error: `engine ${res.status}` }, { status: res.status });
    }
    return json(await res.json());
  } catch (err) {
    return json({ ok: false, error: String(err) }, { status: 500 });
  }
};

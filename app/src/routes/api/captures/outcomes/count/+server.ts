/**
 * GET /api/captures/outcomes/count
 *
 * Returns { count: N } — outcome_ready captures for the authenticated user.
 * Queries Supabase directly for multi-instance consistency.
 * Used by inboxCountStore for nav dot badge.
 */
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

export const GET: RequestHandler = async ({ cookies }) => {
  const user = await getAuthUserFromCookies(cookies);
  if (!user) throw error(401, 'Authentication required');

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { count, error: sbErr } = await sb
    .from('capture_records')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('status', 'outcome_ready');

  if (sbErr) throw error(502, 'count query failed');

  return json({ count: count ?? 0 });
};

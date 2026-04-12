// Stockclaw — Arena Match Detail
// GET /api/arena/match/:id

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { getMatch } from '$lib/server/arenaService';

export const GET: RequestHandler = async ({ cookies, params }) => {
  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });

    const match = await getMatch(user.id, params.id);
    if (!match) return json({ error: 'Match not found' }, { status: 404 });

    return json({ success: true, match });
  } catch (err: any) {
    console.error('[arena/match/id/get]', err);
    return json({ error: 'Failed to load match' }, { status: 500 });
  }
};

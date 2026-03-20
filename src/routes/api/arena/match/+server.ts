// Stockclaw — Arena Match API
// POST /api/arena/match — Create new match
// GET /api/arena/match — List user matches

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { createMatch, listMatches } from '$lib/server/arenaService';
import { toBoundedInt } from '$lib/server/apiValidation';

export const POST: RequestHandler = async ({ cookies, request }) => {
  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });

    const body = await request.json();
    const pair = typeof body.pair === 'string' ? body.pair.trim() : 'BTC/USDT';
    const timeframe = typeof body.timeframe === 'string' ? body.timeframe.trim() : '4h';

    const result = await createMatch(user.id, { pair, timeframe });

    return json({ success: true, ...result });
  } catch (err: any) {
    if (err instanceof SyntaxError) return json({ error: 'Invalid request body' }, { status: 400 });
    console.error('[arena/match/post]', err);
    return json({ error: 'Failed to create match' }, { status: 500 });
  }
};

export const GET: RequestHandler = async ({ cookies, url }) => {
  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });

    const limit = toBoundedInt(url.searchParams.get('limit'), 20, 1, 100);
    const offset = toBoundedInt(url.searchParams.get('offset'), 0, 0, 5000);

    const result = await listMatches(user.id, limit, offset);

    return json({ success: true, ...result, pagination: { limit, offset } });
  } catch (err: any) {
    console.error('[arena/match/get]', err);
    return json({ error: 'Failed to list matches' }, { status: 500 });
  }
};

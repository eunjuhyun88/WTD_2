// Stockclaw — Arena Hypothesis Submit
// POST /api/arena/hypothesis — Submit user direction + confidence

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { submitHypothesis } from '$lib/server/arenaService';
import type { Direction } from '$lib/engine/types';

const VALID_DIRECTIONS = new Set(['LONG', 'SHORT', 'NEUTRAL']);
const VALID_STRATEGIES = new Set(['conservative', 'balanced', 'aggressive']);

export const POST: RequestHandler = async ({ cookies, request }) => {
  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });

    const body = await request.json();
    const matchId = typeof body.matchId === 'string' ? body.matchId.trim() : '';
    if (!matchId) return json({ error: 'matchId is required' }, { status: 400 });

    const direction = typeof body.direction === 'string' ? body.direction.toUpperCase() : '';
    if (!VALID_DIRECTIONS.has(direction)) {
      return json({ error: 'direction must be LONG, SHORT, or NEUTRAL' }, { status: 400 });
    }

    const confidence = typeof body.confidence === 'number' ? body.confidence : 50;
    const exitStrategy = VALID_STRATEGIES.has(body.exitStrategy) ? body.exitStrategy : 'balanced';

    const result = await submitHypothesis(user.id, {
      matchId,
      direction: direction as Direction,
      confidence,
      exitStrategy,
    });

    return json({ success: true, prediction: result.prediction, phase: 'BATTLE' });
  } catch (err: any) {
    if (err instanceof SyntaxError) return json({ error: 'Invalid request body' }, { status: 400 });
    console.error('[arena/hypothesis/post]', err);
    return json({ error: 'Failed to submit hypothesis' }, { status: 500 });
  }
};

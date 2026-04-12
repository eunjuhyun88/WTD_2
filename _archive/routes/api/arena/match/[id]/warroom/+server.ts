// Stockclaw — Arena War Room API
// POST /api/arena/match/[id]/warroom — Generate one round of War Room debate
//
// Body: { round: 1|2|3, previousRounds: WarRoomRoundResult[], userInteractions: WarRoomUserInteraction[] }
// Returns: { success, round: WarRoomRoundResult }

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { getMatch } from '$lib/server/arenaService';
import { generateWarRoomRound, type WarRoomContext } from '$lib/server/warRoomService';
import { emergencyMeetingLimiter } from '$lib/server/rateLimit';
import type {
  WarRoomRound,
  WarRoomRoundResult,
  WarRoomUserInteraction,
} from '$lib/engine/types';

export const POST: RequestHandler = async ({ cookies, params, request, getClientAddress }) => {
  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });

    // Reuse emergency meeting rate limiter (same LLM cost tier)
    const ip = getClientAddress();
    if (!emergencyMeetingLimiter.check(ip)) {
      return json({ error: 'War Room rate limit exceeded. Try again later.' }, { status: 429 });
    }

    const matchId = params.id;
    if (!matchId) return json({ error: 'matchId is required' }, { status: 400 });

    // Parse request body
    const body = await request.json();
    const round = body.round as WarRoomRound;
    const previousRounds = (body.previousRounds ?? []) as WarRoomRoundResult[];
    const userInteractions = (body.userInteractions ?? []) as WarRoomUserInteraction[];

    if (![1, 2, 3].includes(round)) {
      return json({ error: 'round must be 1, 2, or 3' }, { status: 400 });
    }

    // Get match state
    const match = await getMatch(user.id, matchId);
    if (!match) return json({ error: 'Match not found' }, { status: 404 });

    // Must have analysis results
    if (!match.analysisResults || match.analysisResults.length === 0) {
      return json({ error: 'Analysis results not available. Complete ANALYSIS phase first.' }, { status: 400 });
    }

    // Build context and generate
    const ctx: WarRoomContext = {
      matchId,
      pair: match.pair ?? 'BTC/USDT',
      agentOutputs: match.analysisResults,
      previousRounds,
      currentRound: round,
      userInteractions,
    };

    const result = await generateWarRoomRound(ctx);

    return json({
      success: true,
      round: result,
    });
  } catch (err: any) {
    console.error('[arena/match/warroom/post]', err);
    return json({ error: 'Failed to generate War Room round' }, { status: 500 });
  }
};

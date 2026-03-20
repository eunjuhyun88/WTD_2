// Stockclaw — Arena Draft Submit
// POST /api/arena/draft — Submit agent draft for a match

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { submitDraft } from '$lib/server/arenaService';
import type { DraftSelection } from '$lib/engine/types';

export const POST: RequestHandler = async ({ cookies, request }) => {
  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });

    const body = await request.json();
    const matchId = typeof body.matchId === 'string' ? body.matchId.trim() : '';
    if (!matchId) return json({ error: 'matchId is required' }, { status: 400 });

    const draft = Array.isArray(body.draft) ? body.draft as DraftSelection[] : [];
    if (draft.length === 0) return json({ error: 'draft selections are required' }, { status: 400 });

    const result = await submitDraft(user.id, { matchId, draft });
    if (!result.valid) return json({ error: 'Invalid draft', errors: result.errors }, { status: 400 });

    return json({ success: true, phase: 'ANALYSIS' });
  } catch (err: any) {
    if (err instanceof SyntaxError) return json({ error: 'Invalid request body' }, { status: 400 });
    console.error('[arena/draft/post]', err);
    return json({ error: 'Failed to submit draft' }, { status: 500 });
  }
};

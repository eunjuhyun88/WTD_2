import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getTournamentBracket } from '$lib/server/tournamentService';

export const GET: RequestHandler = async ({ params }) => {
  try {
    const bracket = await getTournamentBracket(params.id);
    if (!bracket) return json({ error: 'Tournament not found' }, { status: 404 });
    return json({ success: true, ...bracket });
  } catch (err: any) {
    console.error('[tournaments/id/bracket/get]', err);
    return json({ error: 'Failed to load tournament bracket' }, { status: 500 });
  }
};

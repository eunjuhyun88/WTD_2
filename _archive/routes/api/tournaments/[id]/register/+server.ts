import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { registerTournament, isTournamentError } from '$lib/server/tournamentService';

export const POST: RequestHandler = async ({ cookies, params }) => {
  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });

    const result = await registerTournament(user.id, params.id);
    return json({ success: true, ...result });
  } catch (err: any) {
    if (isTournamentError(err)) {
      return json({ error: err.code, message: err.message }, { status: err.status });
    }
    console.error('[tournaments/id/register/post]', err);
    return json({ error: 'Failed to register tournament' }, { status: 500 });
  }
};

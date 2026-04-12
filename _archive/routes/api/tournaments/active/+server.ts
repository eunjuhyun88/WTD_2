import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { toBoundedInt } from '$lib/server/apiValidation';
import { listActiveTournaments } from '$lib/server/tournamentService';

export const GET: RequestHandler = async ({ url }) => {
  try {
    const limit = toBoundedInt(url.searchParams.get('limit'), 20, 1, 100);
    const records = await listActiveTournaments(limit);
    return json({ success: true, records });
  } catch (err: any) {
    console.error('[tournaments/active/get]', err);
    return json({ error: 'Failed to load active tournaments' }, { status: 500 });
  }
};

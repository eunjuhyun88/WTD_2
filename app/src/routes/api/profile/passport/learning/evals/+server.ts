import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { listPassportEvalReports } from '$lib/server/passportMlPipeline';

export const GET: RequestHandler = async ({ cookies, url }) => {
  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });

    const records = await listPassportEvalReports(user.id, {
      evalScope: url.searchParams.get('evalScope'),
      limit: url.searchParams.get('limit'),
    });

    return json({ success: true, records, count: records.length });
  } catch (error: any) {
    if (typeof error?.message === 'string' && error.message.includes('DATABASE_URL is not set')) {
      return json({ error: 'Server database is not configured' }, { status: 500 });
    }
    console.error('[profile/passport/learning/evals] unexpected error:', error);
    return json({ error: 'Failed to load eval reports' }, { status: 500 });
  }
};

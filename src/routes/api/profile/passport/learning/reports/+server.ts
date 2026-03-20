import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { listPassportReports } from '$lib/server/passportMlPipeline';

export const GET: RequestHandler = async ({ cookies, url }) => {
  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });

    const reports = await listPassportReports(user.id, {
      status: url.searchParams.get('status'),
      limit: url.searchParams.get('limit'),
    });

    return json({ success: true, reports, count: reports.length });
  } catch (error: any) {
    if (typeof error?.message === 'string' && error.message.includes('DATABASE_URL is not set')) {
      return json({ error: 'Server database is not configured' }, { status: 500 });
    }
    console.error('[profile/passport/learning/reports] unexpected error:', error);
    return json({ error: 'Failed to load passport reports' }, { status: 500 });
  }
};

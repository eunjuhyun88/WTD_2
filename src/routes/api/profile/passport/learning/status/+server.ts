import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { getPassportLearningStatus } from '$lib/server/passportMlPipeline';

export const GET: RequestHandler = async ({ cookies }) => {
  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });

    const status = await getPassportLearningStatus(user.id);
    return json({ success: true, status });
  } catch (error: any) {
    if (typeof error?.message === 'string' && error.message.includes('DATABASE_URL is not set')) {
      return json({ error: 'Server database is not configured' }, { status: 500 });
    }
    console.error('[profile/passport/learning/status] unexpected error:', error);
    return json({ error: 'Failed to load learning status' }, { status: 500 });
  }
};

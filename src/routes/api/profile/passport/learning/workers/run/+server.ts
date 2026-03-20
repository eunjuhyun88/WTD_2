import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { runPassportOutboxWorker } from '$lib/server/passportMlPipeline';

export const POST: RequestHandler = async ({ cookies, request }) => {
  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const result = await runPassportOutboxWorker({
      userId: user.id,
      workerId: typeof body?.workerId === 'string' ? body.workerId : `api:${user.id}`,
      limit: body?.limit,
    });

    return json({ success: true, worker: result });
  } catch (error: any) {
    if (typeof error?.message === 'string' && error.message.includes('DATABASE_URL is not set')) {
      return json({ error: 'Server database is not configured' }, { status: 500 });
    }
    console.error('[profile/passport/learning/workers/run] unexpected error:', error);
    return json({ error: 'Failed to run outbox worker' }, { status: 500 });
  }
};

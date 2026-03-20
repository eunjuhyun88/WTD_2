import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { createPassportTrainJob, listPassportTrainJobs } from '$lib/server/passportMlPipeline';

export const GET: RequestHandler = async ({ cookies, url }) => {
  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });

    const jobs = await listPassportTrainJobs(user.id, {
      limit: url.searchParams.get('limit'),
    });

    return json({ success: true, jobs, count: jobs.length });
  } catch (error: any) {
    if (typeof error?.message === 'string' && error.message.includes('DATABASE_URL is not set')) {
      return json({ error: 'Server database is not configured' }, { status: 500 });
    }
    console.error('[profile/passport/learning/train-jobs/GET] unexpected error:', error);
    return json({ error: 'Failed to load train jobs' }, { status: 500 });
  }
};

export const POST: RequestHandler = async ({ cookies, request }) => {
  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });

    const body = await request.json();
    const job = await createPassportTrainJob(user.id, {
      trainType: body?.trainType,
      modelRole: body?.modelRole,
      baseModel: body?.baseModel,
      targetModelVersion: body?.targetModelVersion,
      datasetVersionIds: body?.datasetVersionIds,
      triggerReason: body?.triggerReason,
      hyperparams: body?.hyperparams,
    });

    return json({ success: true, job }, { status: 201 });
  } catch (error: any) {
    if (typeof error?.message === 'string' && error.message.includes('DATABASE_URL is not set')) {
      return json({ error: 'Server database is not configured' }, { status: 500 });
    }
    if (error instanceof SyntaxError) return json({ error: 'Invalid request body' }, { status: 400 });
    console.error('[profile/passport/learning/train-jobs/POST] unexpected error:', error);
    return json({ error: 'Failed to create train job' }, { status: 500 });
  }
};

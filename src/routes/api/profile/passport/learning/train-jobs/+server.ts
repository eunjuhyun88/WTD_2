import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { runIpRateLimitGuard } from '$lib/server/authSecurity';
import { createPassportTrainJob, listPassportTrainJobs } from '$lib/server/passportMlPipeline';
import {
  passportTrainJobCreateLimiter,
  passportTrainJobReadLimiter,
} from '$lib/server/rateLimit';
import { isRequestBodyTooLargeError, readJsonBody } from '$lib/server/requestGuards';

function envBool(name: string, fallback: boolean): boolean {
  const raw = env[name as keyof typeof env];
  if (typeof raw !== 'string') return fallback;
  const normalized = raw.trim().toLowerCase();
  if (!normalized) return fallback;
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function isLearningControlWebEnabled(): boolean {
  return envBool('PASSPORT_LEARNING_CONTROL_WEB_ENABLED', false);
}

function disabledResponse() {
  return json(
    {
      error: 'Passport learning job control is disabled on the web origin',
      code: 'PASSPORT_LEARNING_CONTROL_WEB_DISABLED',
      reason: 'Move report generation and training triggers behind the internal worker/control plane or explicitly enable PASSPORT_LEARNING_CONTROL_WEB_ENABLED for internal use only.',
    },
    { status: 503 },
  );
}

export const GET: RequestHandler = async ({ cookies, url, request, getClientAddress }) => {
  const guard = await runIpRateLimitGuard({
    request,
    fallbackIp: getClientAddress(),
    limiter: passportTrainJobReadLimiter,
    scope: 'passport:train-jobs:list',
    max: 20,
    tooManyMessage: 'Too many passport train-job requests. Please wait.',
  });
  if (!guard.ok) return guard.response;

  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });

    const jobs = await listPassportTrainJobs(user.id, {
      limit: url.searchParams.get('limit'),
    });

    return json(
      { success: true, jobs, count: jobs.length },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  } catch (error: any) {
    if (typeof error?.message === 'string' && error.message.includes('DATABASE_URL is not set')) {
      return json({ error: 'Server database is not configured' }, { status: 500 });
    }
    console.error('[profile/passport/learning/train-jobs/GET] unexpected error:', error);
    return json({ error: 'Failed to load train jobs' }, { status: 500 });
  }
};

export const POST: RequestHandler = async ({ cookies, request, getClientAddress }) => {
  if (!isLearningControlWebEnabled()) {
    return disabledResponse();
  }

  const guard = await runIpRateLimitGuard({
    request,
    fallbackIp: getClientAddress(),
    limiter: passportTrainJobCreateLimiter,
    scope: 'passport:train-jobs:create',
    max: 2,
    tooManyMessage: 'Too many passport train-job creation requests. Please wait.',
  });
  if (!guard.ok) return guard.response;

  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });

    const body = await readJsonBody<Record<string, unknown>>(request, 16 * 1024);
    const job = await createPassportTrainJob(user.id, {
      trainType: body?.trainType,
      modelRole: body?.modelRole,
      baseModel: body?.baseModel,
      targetModelVersion: body?.targetModelVersion,
      datasetVersionIds: body?.datasetVersionIds,
      triggerReason: body?.triggerReason,
      hyperparams: body?.hyperparams,
    });

    return json(
      { success: true, job },
      {
        status: 201,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  } catch (error: any) {
    if (typeof error?.message === 'string' && error.message.includes('DATABASE_URL is not set')) {
      return json({ error: 'Server database is not configured' }, { status: 500 });
    }
    if (isRequestBodyTooLargeError(error)) return json({ error: 'Request body too large' }, { status: 413 });
    if (error instanceof SyntaxError) return json({ error: 'Invalid request body' }, { status: 400 });
    console.error('[profile/passport/learning/train-jobs/POST] unexpected error:', error);
    return json({ error: 'Failed to create train job' }, { status: 500 });
  }
};

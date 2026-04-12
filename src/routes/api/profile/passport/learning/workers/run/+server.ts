import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { runIpRateLimitGuard } from '$lib/server/authSecurity';
import { runPassportOutboxWorker } from '$lib/server/passportMlPipeline';
import { passportWorkerRunLimiter } from '$lib/server/rateLimit';
import { isRequestBodyTooLargeError, readJsonBody } from '$lib/server/requestGuards';

function envBool(name: string, fallback: boolean): boolean {
  const raw = env[name as keyof typeof env];
  if (typeof raw !== 'string') return fallback;
  const normalized = raw.trim().toLowerCase();
  if (!normalized) return fallback;
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function isWorkerWebEnabled(): boolean {
  return envBool('PASSPORT_WORKER_WEB_ENABLED', false);
}

function disabledResponse() {
  return json(
    {
      error: 'Passport worker execution is disabled on the web origin',
      code: 'PASSPORT_WORKER_WEB_DISABLED',
      reason: 'Move this trigger behind the internal worker/control plane or explicitly enable PASSPORT_WORKER_WEB_ENABLED for internal use only.',
    },
    { status: 503 },
  );
}

export const POST: RequestHandler = async ({ cookies, request, getClientAddress }) => {
  if (!isWorkerWebEnabled()) {
    return disabledResponse();
  }

  const guard = await runIpRateLimitGuard({
    request,
    fallbackIp: getClientAddress(),
    limiter: passportWorkerRunLimiter,
    scope: 'passport:worker:run',
    max: 2,
    tooManyMessage: 'Too many passport worker run requests. Please wait.',
  });
  if (!guard.ok) return guard.response;

  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });

    let body: Record<string, unknown> = {};
    try {
      body = await readJsonBody<Record<string, unknown>>(request, 8 * 1024);
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
    }
    const workerId = typeof body?.workerId === 'string' ? body.workerId.trim().slice(0, 120) : '';
    const limitRaw = body?.limit;
    const limit = typeof limitRaw === 'number'
      ? Math.max(1, Math.min(100, Math.trunc(limitRaw)))
      : undefined;
    const result = await runPassportOutboxWorker({
      userId: user.id,
      workerId: workerId || `api:${user.id}`,
      limit,
    });

    return json(
      { success: true, worker: result },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  } catch (error: any) {
    if (isRequestBodyTooLargeError(error)) {
      return json({ error: 'Request body too large' }, { status: 413 });
    }
    if (typeof error?.message === 'string' && error.message.includes('DATABASE_URL is not set')) {
      return json({ error: 'Server database is not configured' }, { status: 500 });
    }
    console.error('[profile/passport/learning/workers/run] unexpected error:', error);
    return json({ error: 'Failed to run outbox worker' }, { status: 500 });
  }
};

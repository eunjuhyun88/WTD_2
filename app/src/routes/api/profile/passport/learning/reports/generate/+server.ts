import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { runIpRateLimitGuard } from '$lib/server/authSecurity';
import { createPassportReportDraft } from '$lib/server/passportMlPipeline';
import { passportReportGenerateLimiter } from '$lib/server/rateLimit';
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

export const POST: RequestHandler = async ({ cookies, request, getClientAddress }) => {
  if (!isLearningControlWebEnabled()) {
    return disabledResponse();
  }

  const guard = await runIpRateLimitGuard({
    request,
    fallbackIp: getClientAddress(),
    limiter: passportReportGenerateLimiter,
    scope: 'passport:reports:generate',
    max: 2,
    tooManyMessage: 'Too many passport report generation requests. Please wait.',
  });
  if (!guard.ok) return guard.response;

  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });

    const body = await readJsonBody<Record<string, unknown>>(request, 16 * 1024);
    const report = await createPassportReportDraft(user.id, {
      reportType: body?.reportType,
      periodStart: body?.periodStart,
      periodEnd: body?.periodEnd,
      modelName: body?.modelName,
      modelVersion: body?.modelVersion,
      inputSnapshot: body?.inputSnapshot,
      summary: body?.summary,
    });

    return json(
      { success: true, report },
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
    console.error('[profile/passport/learning/reports/generate] unexpected error:', error);
    return json({ error: 'Failed to generate report draft' }, { status: 500 });
  }
};

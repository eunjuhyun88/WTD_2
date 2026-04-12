import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { createPassportReportDraft } from '$lib/server/passportMlPipeline';

export const POST: RequestHandler = async ({ cookies, request }) => {
  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });

    const body = await request.json();
    const report = await createPassportReportDraft(user.id, {
      reportType: body?.reportType,
      periodStart: body?.periodStart,
      periodEnd: body?.periodEnd,
      modelName: body?.modelName,
      modelVersion: body?.modelVersion,
      inputSnapshot: body?.inputSnapshot,
      summary: body?.summary,
    });

    return json({ success: true, report }, { status: 201 });
  } catch (error: any) {
    if (typeof error?.message === 'string' && error.message.includes('DATABASE_URL is not set')) {
      return json({ error: 'Server database is not configured' }, { status: 500 });
    }
    if (error instanceof SyntaxError) return json({ error: 'Invalid request body' }, { status: 400 });
    console.error('[profile/passport/learning/reports/generate] unexpected error:', error);
    return json({ error: 'Failed to generate report draft' }, { status: 500 });
  }
};

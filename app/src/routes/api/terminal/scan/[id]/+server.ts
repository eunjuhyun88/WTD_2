import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { UUID_RE } from '$lib/server/apiValidation';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { getTerminalScan } from '$lib/services/scanService';
import { errorContains } from '$lib/utils/errorUtils';

export const GET: RequestHandler = async ({ cookies, params }) => {
  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });

    const scanId = String(params.id || '').trim();
    if (!UUID_RE.test(scanId)) return json({ error: 'Invalid scan id' }, { status: 400 });

    const result = await getTerminalScan(user.id, scanId);
    if (!result.record) return json({ error: 'Scan not found' }, { status: 404 });

    return json({
      success: true,
      ok: true,
      record: result.record,
      warning: result.warning,
      data: result.record,
    });
  } catch (error: unknown) {
    if (errorContains(error, 'DATABASE_URL is not set')) {
      return json({ error: 'Server database is not configured' }, { status: 500 });
    }
    console.error('[terminal/scan/:id/get] unexpected error:', error);
    return json({ error: 'Failed to load scan detail' }, { status: 500 });
  }
};

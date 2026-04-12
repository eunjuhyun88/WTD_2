import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { listTerminalScans } from '$lib/services/scanService';
import { errorContains } from '$lib/utils/errorUtils';

export const GET: RequestHandler = async ({ cookies, url }) => {
  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });

    const result = await listTerminalScans(user.id, {
      pair: url.searchParams.get('pair'),
      timeframe: url.searchParams.get('timeframe'),
      limit: url.searchParams.get('limit'),
      offset: url.searchParams.get('offset'),
    });

    return json({
      success: true,
      ok: true,
      records: result.records,
      pagination: result.pagination,
      warning: result.warning,
      data: {
        records: result.records,
        pagination: result.pagination,
      },
    });
  } catch (error: unknown) {
    if (errorContains(error, 'DATABASE_URL is not set')) {
      return json({ error: 'Server database is not configured' }, { status: 500 });
    }
    console.error('[terminal/scan/history/get] unexpected error:', error);
    return json({ error: 'Failed to load scan history' }, { status: 500 });
  }
};

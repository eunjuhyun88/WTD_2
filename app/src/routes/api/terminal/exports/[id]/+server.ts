import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { getTerminalExportJobForUser } from '$lib/server/terminalPersistence';
import { errorContains } from '$lib/utils/errorUtils';
import { TerminalPersistenceSchemaVersion } from '$lib/contracts/terminalPersistence';

export const GET: RequestHandler = async ({ cookies, params }) => {
  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });
    if (!params.id) return json({ error: 'Export id is required' }, { status: 400 });

    const job = await getTerminalExportJobForUser(user.id, params.id);
    if (!job) return json({ error: 'Export job not found' }, { status: 404 });
    return json({
      ok: true,
      schemaVersion: TerminalPersistenceSchemaVersion,
      job,
    });
  } catch (error: unknown) {
    if (errorContains(error, 'DATABASE_URL is not set')) {
      return json({ error: 'Server database is not configured' }, { status: 500 });
    }
    console.error('[terminal/exports/get] unexpected error:', error);
    return json({ error: 'Failed to load export job' }, { status: 500 });
  }
};

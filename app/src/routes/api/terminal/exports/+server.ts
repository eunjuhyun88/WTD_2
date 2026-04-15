import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { errorContains } from '$lib/utils/errorUtils';
import {
  TerminalExportRequestSchema,
  TerminalPersistenceSchemaVersion,
} from '$lib/contracts/terminalPersistence';
import {
  createTerminalExportJob,
  scheduleTerminalExportJob,
} from '$lib/server/terminalPersistence';

export const POST: RequestHandler = async ({ cookies, request }) => {
  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });

    const body = TerminalExportRequestSchema.parse(await request.json());
    const job = await createTerminalExportJob(user.id, body);
    scheduleTerminalExportJob(job.id);
    return json({
      ok: true,
      schemaVersion: TerminalPersistenceSchemaVersion,
      job,
    });
  } catch (error: unknown) {
    if (error instanceof SyntaxError) return json({ error: 'Invalid request body' }, { status: 400 });
    if (error instanceof Error && error.name === 'ZodError') return json({ error: 'Invalid export payload' }, { status: 400 });
    if (errorContains(error, 'DATABASE_URL is not set')) {
      return json({ error: 'Server database is not configured' }, { status: 500 });
    }
    console.error('[terminal/exports/post] unexpected error:', error);
    return json({ error: 'Failed to create export job' }, { status: 500 });
  }
};

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { errorContains } from '$lib/utils/errorUtils';
import {
  TerminalAlertCreateRequestSchema,
  TerminalPersistenceSchemaVersion,
} from '$lib/contracts/terminalPersistence';
import { listTerminalAlerts, upsertTerminalAlert } from '$lib/server/terminalPersistence';

export const GET: RequestHandler = async ({ cookies }) => {
  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });

    const alerts = await listTerminalAlerts(user.id);
    return json({
      ok: true,
      schemaVersion: TerminalPersistenceSchemaVersion,
      alerts,
      updatedAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    if (errorContains(error, 'DATABASE_URL is not set')) {
      return json({ error: 'Server database is not configured' }, { status: 500 });
    }
    console.error('[terminal/alerts/get] unexpected error:', error);
    return json({ error: 'Failed to load alerts' }, { status: 500 });
  }
};

export const POST: RequestHandler = async ({ cookies, request }) => {
  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });

    const body = TerminalAlertCreateRequestSchema.parse(await request.json());
    const alert = await upsertTerminalAlert(user.id, body);
    return json({
      ok: true,
      schemaVersion: TerminalPersistenceSchemaVersion,
      alerts: [alert],
      updatedAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    if (error instanceof SyntaxError) return json({ error: 'Invalid request body' }, { status: 400 });
    if (error instanceof Error && error.name === 'ZodError') return json({ error: 'Invalid alert payload' }, { status: 400 });
    if (errorContains(error, 'DATABASE_URL is not set')) {
      return json({ error: 'Server database is not configured' }, { status: 500 });
    }
    console.error('[terminal/alerts/post] unexpected error:', error);
    return json({ error: 'Failed to create alert' }, { status: 500 });
  }
};

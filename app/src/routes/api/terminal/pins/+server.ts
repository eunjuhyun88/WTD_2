import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { errorContains } from '$lib/utils/errorUtils';
import {
  TerminalPersistenceSchemaVersion,
  TerminalPinsRequestSchema,
} from '$lib/contracts/terminalPersistence';
import { listTerminalPins, replaceTerminalPins } from '$lib/server/terminalPersistence';

export const GET: RequestHandler = async ({ cookies }) => {
  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });

    const pins = await listTerminalPins(user.id);
    return json({
      ok: true,
      schemaVersion: TerminalPersistenceSchemaVersion,
      pins,
      updatedAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    if (errorContains(error, 'DATABASE_URL is not set')) {
      return json({ error: 'Server database is not configured' }, { status: 500 });
    }
    console.error('[terminal/pins/get] unexpected error:', error);
    return json({ error: 'Failed to load pins' }, { status: 500 });
  }
};

export const PUT: RequestHandler = async ({ cookies, request }) => {
  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });

    const body = TerminalPinsRequestSchema.parse(await request.json());
    const pins = await replaceTerminalPins(user.id, body.pins);
    return json({
      ok: true,
      schemaVersion: TerminalPersistenceSchemaVersion,
      pins,
      updatedAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    if (error instanceof SyntaxError) return json({ error: 'Invalid request body' }, { status: 400 });
    if (error instanceof Error && error.name === 'ZodError') return json({ error: 'Invalid pins payload' }, { status: 400 });
    if (errorContains(error, 'DATABASE_URL is not set')) {
      return json({ error: 'Server database is not configured' }, { status: 500 });
    }
    console.error('[terminal/pins/put] unexpected error:', error);
    return json({ error: 'Failed to update pins' }, { status: 500 });
  }
};

import { json } from '@sveltejs/kit';
import { ZodError } from 'zod';
import type { RequestHandler } from './$types';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { errorContains } from '$lib/utils/errorUtils';
import {
  PatternCaptureCreateRequestSchema,
  PatternCaptureQuerySchema,
  TerminalPersistenceSchemaVersion,
} from '$lib/contracts/terminalPersistence';
import { createPatternCapture, listPatternCaptures } from '$lib/server/terminalPersistence';

export const GET: RequestHandler = async ({ cookies, url }) => {
  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });
    const parsed = PatternCaptureQuerySchema.parse({
      symbol: url.searchParams.get('symbol') ?? undefined,
      timeframe: url.searchParams.get('timeframe') ?? undefined,
      verdict: url.searchParams.get('verdict') ?? undefined,
      triggerOrigin: url.searchParams.get('triggerOrigin') ?? undefined,
      limit: url.searchParams.get('limit') ? Number(url.searchParams.get('limit')) : undefined,
    });
    const records = await listPatternCaptures(user.id, parsed);
    return json({
      ok: true,
      schemaVersion: TerminalPersistenceSchemaVersion,
      records,
      updatedAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'ZodError') return json({ error: 'Invalid query' }, { status: 400 });
    if (errorContains(error, 'DATABASE_URL is not set')) return json({ error: 'Server database is not configured' }, { status: 500 });
    console.error('[terminal/pattern-captures/get] unexpected error:', error);
    return json({ error: 'Failed to load pattern captures' }, { status: 500 });
  }
};

export const POST: RequestHandler = async ({ cookies, request }) => {
  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });
    const body = PatternCaptureCreateRequestSchema.parse(await request.json());
    const record = await createPatternCapture(user.id, body);
    return json({
      ok: true,
      schemaVersion: TerminalPersistenceSchemaVersion,
      records: [record],
      updatedAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    if (error instanceof SyntaxError) return json({ error: 'Invalid request body' }, { status: 400 });
    if (error instanceof ZodError) {
      const missingViewport = error.issues.some((issue) => issue.path.join('.') === 'snapshot.viewport');
      return json({ error: missingViewport ? 'Reviewed chart range is required' : 'Invalid capture payload' }, { status: 400 });
    }
    if (errorContains(error, 'DATABASE_URL is not set')) return json({ error: 'Server database is not configured' }, { status: 500 });
    console.error('[terminal/pattern-captures/post] unexpected error:', error);
    return json({ error: 'Failed to create pattern capture' }, { status: 500 });
  }
};

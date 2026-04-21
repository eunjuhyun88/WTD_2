import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { errorContains } from '$lib/utils/errorUtils';
import { engineFetch } from '$lib/server/engineTransport';
import {
  PatternCaptureCreateRequestSchema,
  PatternCaptureQuerySchema,
  TerminalPersistenceSchemaVersion,
  type PatternCaptureCreateRequest,
} from '$lib/contracts/terminalPersistence';
import { createPatternCapture, listPatternCaptures } from '$lib/server/terminalPersistence';

// Phase A dual-write: replicate Save Setup to the engine CaptureStore so the
// flywheel outcome resolver and refinement trigger have data to work with.
// Non-blocking — engine failures must never break the user's Save Setup UX.
function syncCaptureToEngine(userId: string, body: PatternCaptureCreateRequest): void {
  engineFetch('/captures', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      capture_kind: 'manual_hypothesis',
      user_id: userId,
      symbol: body.symbol,
      timeframe: body.timeframe,
      pattern_slug: body.patternSlug ?? '',
      user_note: body.note ?? null,
      captured_at_ms: Date.now(),
    }),
    signal: AbortSignal.timeout(5000),
  }).catch((err: unknown) => {
    console.warn('[pattern-captures] engine dual-write failed (non-fatal):', err);
  });
}

export const GET: RequestHandler = async ({ cookies, url }) => {
  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });
    const parsed = PatternCaptureQuerySchema.parse({
      id: url.searchParams.get('id') ?? undefined,
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
    if (body.sourceFreshness.source === 'terminal_save_setup' && !body.snapshot.viewport) {
      return json({ error: 'Reviewed range viewport is required for Save Setup' }, { status: 400 });
    }
    const record = await createPatternCapture(user.id, body);
    syncCaptureToEngine(user.id, body); // fire-and-forget; does not affect response
    return json({
      ok: true,
      schemaVersion: TerminalPersistenceSchemaVersion,
      records: [record],
      updatedAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    if (error instanceof SyntaxError) return json({ error: 'Invalid request body' }, { status: 400 });
    if (error instanceof Error && error.name === 'ZodError') return json({ error: 'Invalid capture payload' }, { status: 400 });
    if (errorContains(error, 'DATABASE_URL is not set')) return json({ error: 'Server database is not configured' }, { status: 500 });
    console.error('[terminal/pattern-captures/post] unexpected error:', error);
    return json({ error: 'Failed to create pattern capture' }, { status: 500 });
  }
};

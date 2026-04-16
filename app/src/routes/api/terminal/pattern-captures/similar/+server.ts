import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { errorContains } from '$lib/utils/errorUtils';
import {
  PatternCaptureQuerySchema,
  PatternCaptureSimilarityDraftSchema,
  TerminalPersistenceSchemaVersion,
} from '$lib/contracts/terminalPersistence';
import { listPatternCaptures } from '$lib/server/terminalPersistence';
import { rankSimilarPatternCaptures } from '$lib/terminal/patternCaptureSimilarity';

export const POST: RequestHandler = async ({ cookies, request }) => {
  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });

    const draft = PatternCaptureSimilarityDraftSchema.parse(await request.json());
    const records = await listPatternCaptures(
      user.id,
      PatternCaptureQuerySchema.parse({
        timeframe: draft.timeframe,
        limit: 200,
      }),
    );

    const matches = rankSimilarPatternCaptures({
      draft,
      records,
      limit: draft.limit,
    });

    return json({
      ok: true,
      schemaVersion: TerminalPersistenceSchemaVersion,
      matches,
      updatedAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    if (error instanceof SyntaxError) return json({ error: 'Invalid request body' }, { status: 400 });
    if (error instanceof Error && error.name === 'ZodError') return json({ error: 'Invalid similarity payload' }, { status: 400 });
    if (errorContains(error, 'DATABASE_URL is not set')) return json({ error: 'Server database is not configured' }, { status: 500 });
    console.error('[terminal/pattern-captures/similar/post] unexpected error:', error);
    return json({ error: 'Failed to load similar pattern captures' }, { status: 500 });
  }
};

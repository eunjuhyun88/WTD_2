import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { EngineError, engine } from '$lib/server/engineClient';
import { buildChallengeSnapFromPatternCapture } from '$lib/server/patternCaptureProjection';
import { listPatternCaptures } from '$lib/server/terminalPersistence';
import {
  PatternCaptureProjectionRequestSchema,
  TerminalPersistenceSchemaVersion,
} from '$lib/contracts/terminalPersistence';
import { errorContains } from '$lib/utils/errorUtils';

async function readOptionalJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) return {};
    throw error;
  }
}

export const POST: RequestHandler = async ({ cookies, params, request }) => {
  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });

    const body = PatternCaptureProjectionRequestSchema.parse(await readOptionalJson(request));
    const records = await listPatternCaptures(user.id, { id: params.id, limit: 1 });
    const record = records.find((item) => item.id === params.id) ?? records[0];
    if (!record) return json({ error: 'Capture not found' }, { status: 404 });

    const snap = buildChallengeSnapFromPatternCapture(record);
    if (!snap) {
      return json({ error: 'Capture has no reviewed viewport to project' }, { status: 400 });
    }

    const challenge = await engine.createChallenge([snap], user.id);
    const challengeSlug = typeof challenge.slug === 'string' ? challenge.slug : null;
    let matches: Array<{ symbol: string; timestamp: string; similarity: number; pWin: number | null; price: number }> = [];

    if (body.scan && challengeSlug) {
      const scan = await engine.scanChallenge(challengeSlug);
      matches = (scan.matches ?? []).slice(0, body.limit).map((match) => ({
        symbol: match.symbol,
        timestamp: match.timestamp,
        similarity: match.similarity,
        pWin: match.p_win ?? null,
        price: match.price,
      }));
    }

    return json({
      ok: true,
      schemaVersion: TerminalPersistenceSchemaVersion,
      captureId: record.id,
      challengeSlug,
      snap,
      matches,
      updatedAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'ZodError') return json({ error: 'Invalid projection payload' }, { status: 400 });
    if (error instanceof EngineError && error.status === 400) {
      return json({ error: 'Capture cannot be projected with current engine cache', detail: error.message }, { status: 422 });
    }
    if (errorContains(error, 'DATABASE_URL is not set')) return json({ error: 'Server database is not configured' }, { status: 500 });
    console.error('[terminal/pattern-captures/project] unexpected error:', error);
    return json({ error: 'Failed to project pattern capture' }, { status: 500 });
  }
};

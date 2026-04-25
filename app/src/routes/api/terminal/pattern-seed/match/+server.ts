import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { runPatternSeedMatch, PatternSeedMatchError } from '$lib/server/patternSeed/match';

const MatchRequestBodySchema = z.object({
  thesis: z.string().trim().min(1),
  activeSymbol: z.string().trim().min(1).optional(),
  timeframe: z.string().trim().min(1).optional(),
  snapshotNames: z.array(z.string().min(1)).max(6).default([]),
  boardSymbols: z.array(z.string().min(1)).max(64).default([]),
  assets: z
    .array(z.union([z.string().min(1), z.object({ symbol: z.string().min(1) })]))
    .max(64)
    .optional(),
});

export const POST: RequestHandler = async ({ cookies, request }) => {
  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ ok: false, error: 'Authentication required' }, { status: 401 });

    const body = MatchRequestBodySchema.parse(await request.json());
    const result = await runPatternSeedMatch({
      userId: user.id,
      thesis: body.thesis,
      activeSymbol: body.activeSymbol,
      timeframe: body.timeframe,
      snapshotNames: body.snapshotNames,
      boardSymbols: body.boardSymbols,
      assets: body.assets,
    });
    return json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return json({ ok: false, error: 'Invalid pattern seed payload' }, { status: 400 });
    }
    if (error instanceof PatternSeedMatchError) {
      return json({ ok: false, error: error.message }, { status: error.status });
    }
    return json(
      { ok: false, error: `Failed to match pattern seed: ${String(error)}` },
      { status: 500 },
    );
  }
};

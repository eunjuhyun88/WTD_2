import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import {
  PatternSeedMatchError,
  PatternSeedMatchInputSchema,
  runPatternSeedMatch,
} from '$lib/server/patternSeed/match';

export const POST: RequestHandler = async ({ cookies, request }) => {
  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ ok: false, error: 'Authentication required' }, { status: 401 });

    const body = PatternSeedMatchInputSchema.omit({ userId: true }).parse(await request.json());
    const payload = await runPatternSeedMatch({
      userId: user.id,
      ...body,
    });
    return json(payload);
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

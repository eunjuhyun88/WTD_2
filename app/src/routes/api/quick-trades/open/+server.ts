import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { normalizePair, normalizeTradeDir, PAIR_RE, toPositiveNumber } from '$lib/server/apiValidation';
import { openQuickTrade } from '$lib/server/quickTradeOpen';

export const POST: RequestHandler = async ({ cookies, request }) => {
  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });

    const body = await request.json();
    const pair = normalizePair(body?.pair);
    const dir = normalizeTradeDir(body?.dir);
    const entry = toPositiveNumber(body?.entry, 0);
    const tp = body?.tp == null ? null : toPositiveNumber(body.tp, 0);
    const sl = body?.sl == null ? null : toPositiveNumber(body.sl, 0);
    const currentPrice = toPositiveNumber(body?.currentPrice, entry);
    const source = typeof body?.source === 'string' ? body.source.trim().toLowerCase() : 'manual';
    const note = typeof body?.note === 'string' ? body.note.trim() : '';

    if (!PAIR_RE.test(pair)) return json({ error: 'Invalid pair format' }, { status: 400 });
    if (!dir) return json({ error: 'dir must be LONG or SHORT' }, { status: 400 });
    if (entry <= 0) return json({ error: 'entry must be greater than 0' }, { status: 400 });

    const trade = await openQuickTrade({
      userId: user.id,
      pair,
      dir,
      entry,
      tp,
      sl,
      currentPrice,
      source,
      note,
    });

    return json({ success: true, trade });
  } catch (error: any) {
    if (typeof error?.message === 'string' && error.message.includes('DATABASE_URL is not set')) {
      return json({ error: 'Server database is not configured' }, { status: 500 });
    }
    if (error instanceof SyntaxError) return json({ error: 'Invalid request body' }, { status: 400 });
    console.error('[quick-trades/open] unexpected error:', error);
    return json({ error: 'Failed to open trade' }, { status: 500 });
  }
};

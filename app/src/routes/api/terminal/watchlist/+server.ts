import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { errorContains } from '$lib/utils/errorUtils';
import {
  TerminalPersistenceSchemaVersion,
  TerminalWatchlistRequestSchema,
} from '$lib/contracts/terminalPersistence';
import { listTerminalWatchlist, replaceTerminalWatchlist } from '$lib/server/terminalPersistence';
import { enrichTerminalWatchlist } from '$lib/server/terminal/analysisAdapter';

export const GET: RequestHandler = async ({ cookies }) => {
  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });

    const items = await enrichTerminalWatchlist(await listTerminalWatchlist(user.id));
    return json({
      ok: true,
      schemaVersion: TerminalPersistenceSchemaVersion,
      items,
      activeSymbol: items.find((item) => item.active)?.symbol,
      updatedAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    if (errorContains(error, 'DATABASE_URL is not set')) {
      return json({ error: 'Server database is not configured' }, { status: 500 });
    }
    console.error('[terminal/watchlist/get] unexpected error:', error);
    return json({ error: 'Failed to load watchlist' }, { status: 500 });
  }
};

export const PUT: RequestHandler = async ({ cookies, request }) => {
  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });

    const body = TerminalWatchlistRequestSchema.parse(await request.json());
    const deduped = body.items.filter((item, index, arr) => arr.findIndex((candidate) => candidate.symbol === item.symbol) === index);
    const items = await enrichTerminalWatchlist(await replaceTerminalWatchlist(user.id, deduped, body.activeSymbol));
    return json({
      ok: true,
      schemaVersion: TerminalPersistenceSchemaVersion,
      items,
      activeSymbol: body.activeSymbol,
      updatedAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    if (error instanceof SyntaxError) return json({ error: 'Invalid request body' }, { status: 400 });
    if (error instanceof Error && error.name === 'ZodError') return json({ error: 'Invalid watchlist payload' }, { status: 400 });
    if (errorContains(error, 'DATABASE_URL is not set')) {
      return json({ error: 'Server database is not configured' }, { status: 500 });
    }
    console.error('[terminal/watchlist/put] unexpected error:', error);
    return json({ error: 'Failed to update watchlist' }, { status: 500 });
  }
};

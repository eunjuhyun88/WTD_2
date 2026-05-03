// POST /api/lab/send-to-terminal
// Upserts a symbol into terminal_candidates so WatchlistRail can show it.

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { query } from '$lib/server/db';
import { errorContains } from '$lib/utils/errorUtils';

interface SendToTerminalBody {
  symbol?: unknown;
  strategy_id?: unknown;
}

export const POST: RequestHandler = async ({ cookies, request }) => {
  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });

    let body: SendToTerminalBody;
    try {
      body = await request.json() as SendToTerminalBody;
    } catch {
      return json({ error: 'Invalid request body' }, { status: 400 });
    }

    const symbol = typeof body.symbol === 'string' ? body.symbol.trim().toUpperCase() : null;
    if (!symbol) return json({ error: 'symbol is required' }, { status: 400 });

    const strategyId =
      typeof body.strategy_id === 'string' && body.strategy_id.trim()
        ? body.strategy_id.trim()
        : null;

    const result = await query(
      `INSERT INTO terminal_candidates (user_id, symbol, source, strategy_id)
       VALUES ($1, $2, 'lab', $3)
       ON CONFLICT (user_id, symbol, source) DO NOTHING
       RETURNING id`,
      [user.id, symbol, strategyId],
    );

    const added = (result.rows?.length ?? 0) > 0;
    return json({ success: true, added });
  } catch (error: unknown) {
    if (errorContains(error, 'DATABASE_URL is not set')) {
      return json({ error: 'Server database is not configured' }, { status: 500 });
    }
    console.error('[api/lab/send-to-terminal] POST error:', error);
    return json({ error: 'Failed to send to terminal' }, { status: 500 });
  }
};

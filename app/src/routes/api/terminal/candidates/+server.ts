// GET /api/terminal/candidates
// Returns terminal_candidates rows for the authenticated user (up to 20, newest first).

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { query } from '$lib/server/db';
import { errorContains } from '$lib/utils/errorUtils';

export interface TerminalCandidate {
  id: string;
  symbol: string;
  source: string;
  strategy_id: string | null;
  created_at: string;
}

export const GET: RequestHandler = async ({ cookies }) => {
  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });

    const result = await query(
      `SELECT id, symbol, source, strategy_id, created_at
         FROM terminal_candidates
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 20`,
      [user.id],
    );

    const candidates: TerminalCandidate[] = (result.rows ?? []).map((row: Record<string, unknown>) => ({
      id: String(row.id ?? ''),
      symbol: String(row.symbol ?? ''),
      source: String(row.source ?? 'lab'),
      strategy_id: row.strategy_id ? String(row.strategy_id) : null,
      created_at: row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at ?? new Date().toISOString()),
    }));

    return json({ ok: true, candidates });
  } catch (error: unknown) {
    if (errorContains(error, 'DATABASE_URL is not set')) {
      return json({ error: 'Server database is not configured' }, { status: 500 });
    }
    console.error('[api/terminal/candidates] GET error:', error);
    return json({ error: 'Failed to load candidates' }, { status: 500 });
  }
};

/**
 * GET  /api/watchlist         — list user watchlist symbols (ordered by position)
 * PATCH /api/watchlist        — add/remove/reorder symbols
 *
 * PATCH body:
 *   { action: 'add',    symbol: string }
 *   { action: 'remove', symbol: string }
 *   { action: 'reorder', symbols: string[] }
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db';
import { getAuthUserFromCookies } from '$lib/server/authGuard';

export const GET: RequestHandler = async ({ cookies }) => {
  const user = await getAuthUserFromCookies(cookies);
  if (!user) return json({ symbols: [] });

  try {
    const result = await query<{ symbol: string; position: number }>(
      `SELECT symbol, position FROM user_watchlist
       WHERE user_id = $1
       ORDER BY position ASC, created_at ASC`,
      [user.id],
    );
    return json({ symbols: result.rows.map((r) => r.symbol) });
  } catch {
    return json({ symbols: [] });
  }
};

export const PATCH: RequestHandler = async ({ request, cookies }) => {
  const user = await getAuthUserFromCookies(cookies);
  if (!user) throw error(401, 'Authentication required');

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    throw error(400, 'Invalid JSON');
  }

  const action = body.action as string | undefined;

  if (action === 'add') {
    const symbol = (body.symbol as string | undefined)?.trim().toUpperCase();
    if (!symbol || symbol.length < 2) throw error(400, 'symbol required');
    try {
      const count = await query<{ count: string }>(
        'SELECT COUNT(*) AS count FROM user_watchlist WHERE user_id = $1',
        [user.id],
      );
      const pos = parseInt(count.rows[0]?.count ?? '0', 10);
      await query(
        `INSERT INTO user_watchlist (user_id, symbol, position)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, symbol) DO NOTHING`,
        [user.id, symbol, pos],
      );
    } catch {
      throw error(500, 'Failed to add symbol');
    }
    return json({ ok: true });
  }

  if (action === 'remove') {
    const symbol = (body.symbol as string | undefined)?.trim().toUpperCase();
    if (!symbol) throw error(400, 'symbol required');
    try {
      await query(
        'DELETE FROM user_watchlist WHERE user_id = $1 AND symbol = $2',
        [user.id, symbol],
      );
    } catch {
      throw error(500, 'Failed to remove symbol');
    }
    return json({ ok: true });
  }

  if (action === 'reorder') {
    const symbols = body.symbols as string[] | undefined;
    if (!Array.isArray(symbols)) throw error(400, 'symbols array required');
    try {
      // Update positions in a single transaction via multi-row unnest
      if (symbols.length > 0) {
        const values = symbols.map((s, i) => `('${user.id}', '${s.trim().toUpperCase()}', ${i})`).join(',');
        await query(
          `INSERT INTO user_watchlist (user_id, symbol, position)
           VALUES ${values}
           ON CONFLICT (user_id, symbol) DO UPDATE SET position = EXCLUDED.position, updated_at = now()`,
          [],
        );
      }
    } catch {
      throw error(500, 'Failed to reorder');
    }
    return json({ ok: true });
  }

  throw error(400, 'Unknown action. Expected: add | remove | reorder');
};

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { UUID_RE } from '$lib/server/apiValidation';
import { errorContains } from '$lib/utils/errorUtils';

export const DELETE: RequestHandler = async ({ cookies, params }) => {
  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });

    const id = params.id;
    if (!id || !UUID_RE.test(id)) return json({ error: 'Invalid signal id' }, { status: 400 });

    const result = await query<{ id: string; pair: string; dir: string; source: string | null; confidence: number | null }>(
      `
        UPDATE tracked_signals
        SET status = 'expired'
        WHERE id = $1 AND user_id = $2 AND status = 'tracking'
        RETURNING id, pair, dir, source, confidence
      `,
      [id, user.id]
    );

    if (!result.rowCount) return json({ error: 'Tracking signal not found' }, { status: 404 });

    const row = result.rows[0];
    await query(
      `
        INSERT INTO signal_actions (user_id, signal_id, pair, dir, action_type, source, confidence, payload)
        VALUES ($1, $2, $3, $4, 'untrack', $5, $6, '{}'::jsonb)
      `,
      [user.id, row.id, row.pair, row.dir, row.source || 'manual', row.confidence ?? null]
    ).catch(() => undefined);

    return json({ success: true, signalId: row.id, status: 'expired' });
  } catch (error: unknown) {
    if (errorContains(error, 'DATABASE_URL is not set')) {
      return json({ error: 'Server database is not configured' }, { status: 500 });
    }
    console.error('[signals/delete] unexpected error:', error);
    return json({ error: 'Failed to untrack signal' }, { status: 500 });
  }
};

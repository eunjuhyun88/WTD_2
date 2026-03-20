import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { withTransaction } from '$lib/server/db';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { toPositiveNumber, UUID_RE } from '$lib/server/apiValidation';
import { errorContains } from '$lib/utils/errorUtils';

interface TrackedSignalRow {
  id: string;
  user_id: string;
  pair: string;
  dir: 'LONG' | 'SHORT';
  confidence: number;
  entry_price: number;
  current_price: number;
  status: 'tracking' | 'expired' | 'converted';
  source: string | null;
  note: string | null;
}

export const POST: RequestHandler = async ({ cookies, request, params }) => {
  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });

    const id = params.id;
    if (!id || !UUID_RE.test(id)) return json({ error: 'Invalid signal id' }, { status: 400 });
    const body = await request.json().catch(() => ({}));

    const outcome = await withTransaction(async (client) => {
      const signalResult = await client.query<TrackedSignalRow>(
        `
          SELECT id, user_id, pair, dir, confidence, entry_price, current_price, status, source, note
          FROM tracked_signals
          WHERE id = $1 AND user_id = $2
          LIMIT 1
        `,
        [id, user.id]
      );

      const signal = signalResult.rows[0];
      if (!signal) return { error: 'Signal not found', status: 404 as const };
      if (signal.status !== 'tracking') return { error: 'Only tracking signals can be converted', status: 409 as const };

      const entry = toPositiveNumber(body?.entry, Number(signal.entry_price));
      const tp = body?.tp == null ? null : toPositiveNumber(body.tp, 0);
      const sl = body?.sl == null ? null : toPositiveNumber(body.sl, 0);
      const note = typeof body?.note === 'string' && body.note.trim() ? body.note.trim() : signal.note || '';

      const tradeResult = await client.query<{ id: string; pair: string; dir: string; entry: number; tp: number | null; sl: number | null; current_price: number; status: string; opened_at: string }>(
        `
          INSERT INTO quick_trades (
            user_id, pair, dir, entry, tp, sl, current_price,
            pnl_percent, status, source, note, opened_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, 0, 'open', 'signal-convert', $8, now())
          RETURNING id, pair, dir, entry, tp, sl, current_price, status, opened_at
        `,
        [user.id, signal.pair, signal.dir, entry, tp, sl, Number(signal.current_price), note]
      );

      const trade = tradeResult.rows[0];

      await client.query(`UPDATE tracked_signals SET status = 'converted' WHERE id = $1 AND user_id = $2`, [id, user.id]);

      await client.query(
        `
          INSERT INTO signal_actions (user_id, signal_id, linked_trade_id, pair, dir, action_type, source, confidence, payload)
          VALUES ($1, $2, $3, $4, $5, 'convert_to_trade', $6, $7, $8::jsonb)
        `,
        [
          user.id,
          id,
          trade.id,
          signal.pair,
          signal.dir,
          signal.source || 'manual',
          Number(signal.confidence ?? 0),
          JSON.stringify({ note }),
        ]
      );

      return {
        success: true as const,
        trade: {
          id: trade.id,
          pair: trade.pair,
          dir: trade.dir,
          entry: Number(trade.entry),
          tp: trade.tp == null ? null : Number(trade.tp),
          sl: trade.sl == null ? null : Number(trade.sl),
          currentPrice: Number(trade.current_price),
          status: trade.status,
          openedAt: new Date(trade.opened_at).getTime(),
        },
      };
    });

    if ('error' in outcome) return json({ error: outcome.error }, { status: outcome.status });
    return json(outcome);
  } catch (error: unknown) {
    if (errorContains(error, 'DATABASE_URL is not set')) {
      return json({ error: 'Server database is not configured' }, { status: 500 });
    }
    console.error('[signals/convert] unexpected error:', error);
    return json({ error: 'Failed to convert signal' }, { status: 500 });
  }
};

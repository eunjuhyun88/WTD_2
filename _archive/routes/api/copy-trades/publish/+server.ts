import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { withTransaction } from '$lib/server/db';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import {
  normalizePair,
  normalizeTradeDir,
  PAIR_RE,
  toBoundedInt,
  toPositiveNumber,
} from '$lib/server/apiValidation';
import { enqueuePassportEventBestEffort } from '$lib/server/passportOutbox';

interface CopyTradeDraftPayload {
  pair?: string;
  dir?: string;
  entry?: number;
  tp?: number[];
  sl?: number;
  note?: string;
  source?: string;
  evidence?: { conf?: number }[];
}

function calcAverageConfidence(draft: CopyTradeDraftPayload, fallback = 70): number {
  if (!Array.isArray(draft.evidence) || draft.evidence.length === 0) return fallback;
  const vals = draft.evidence
    .map((e) => (typeof e?.conf === 'number' ? e.conf : NaN))
    .filter((n) => Number.isFinite(n));
  if (vals.length === 0) return fallback;
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  return Math.max(1, Math.min(100, Math.round(avg)));
}

export const POST: RequestHandler = async ({ cookies, request }) => {
  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });

    const body = await request.json();
    const selectedSignalIds = Array.isArray(body?.selectedSignalIds)
      ? body.selectedSignalIds.filter((x: unknown) => typeof x === 'string')
      : [];
    const draft = (body?.draft && typeof body.draft === 'object' ? body.draft : {}) as CopyTradeDraftPayload;

    const pair = normalizePair(draft.pair);
    const dir = normalizeTradeDir(draft.dir);
    const entry = toPositiveNumber(draft.entry, 0);
    const tp = Array.isArray(draft.tp) && draft.tp.length > 0 ? toPositiveNumber(draft.tp[0], 0) : null;
    const sl = draft.sl == null ? null : toPositiveNumber(draft.sl, 0);
    const note = typeof draft.note === 'string' ? draft.note.trim() : '';
    const source = typeof draft.source === 'string' ? draft.source.trim() : 'copy-trade';
    const confidence = toBoundedInt(body?.confidence, calcAverageConfidence(draft), 1, 100);

    if (!PAIR_RE.test(pair)) return json({ error: 'Invalid draft.pair format' }, { status: 400 });
    if (!dir) return json({ error: 'draft.dir must be LONG or SHORT' }, { status: 400 });
    if (entry <= 0) return json({ error: 'draft.entry must be greater than 0' }, { status: 400 });

    const outcome = await withTransaction(async (client) => {
      const trade = await client.query(
        `
          INSERT INTO quick_trades (
            user_id, pair, dir, entry, tp, sl, current_price,
            pnl_percent, status, source, note, opened_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $4, 0, 'open', 'copy-trade', $7, now())
          RETURNING id, pair, dir, entry, tp, sl, current_price, status, opened_at
        `,
        [user.id, pair, dir, entry, tp, sl, note]
      );

      const signal = await client.query(
        `
          INSERT INTO tracked_signals (
            user_id, pair, dir, confidence, entry_price, current_price,
            pnl_percent, status, source, note, tracked_at, expires_at
          )
          VALUES (
            $1, $2, $3, $4, $5, $5,
            0, 'tracking', 'COPY TRADE', $6, now(), now() + interval '24 hours'
          )
          RETURNING id, pair, dir, confidence, entry_price, current_price, status, tracked_at, expires_at
        `,
        [user.id, pair, dir, confidence, entry, note]
      );

      const run = await client.query(
        `
          INSERT INTO copy_trade_runs (
            user_id, selected_signal_ids, draft, published,
            published_trade_id, published_signal_id, created_at, published_at
          )
          VALUES ($1, $2::text[], $3::jsonb, true, $4, $5, now(), now())
          RETURNING
            id, user_id, selected_signal_ids, draft, published,
            published_trade_id, published_signal_id, created_at, published_at
        `,
        [user.id, selectedSignalIds, JSON.stringify(draft), trade.rows[0].id, signal.rows[0].id]
      );

      await client.query(
        `
          INSERT INTO signal_actions (
            user_id, signal_id, linked_trade_id, pair, dir,
            action_type, source, confidence, payload, created_at
          )
          VALUES ($1, $2, $3, $4, $5, 'copy_trade', $6, $7, $8::jsonb, now())
        `,
        [
          user.id,
          signal.rows[0].id,
          trade.rows[0].id,
          pair,
          dir,
          source,
          confidence,
          JSON.stringify({ selectedSignalIds }),
        ]
      );

      await client.query(
        `
          INSERT INTO activity_events (user_id, event_type, source_page, source_id, severity, payload)
          VALUES ($1, 'copytrade_published', 'signals', $2, 'success', $3::jsonb)
        `,
        [user.id, run.rows[0].id, JSON.stringify({ pair, dir, confidence })]
      );

      await enqueuePassportEventBestEffort(
        {
          userId: user.id,
          eventType: 'copy_trade_published',
          sourceTable: 'copy_trade_runs',
          sourceId: run.rows[0].id,
          traceId: `copy-trade:${run.rows[0].id}`,
          idempotencyKey: `copy_trade_published:${run.rows[0].id}`,
          payload: {
            context: {
              pair,
              source,
              selectedSignalCount: selectedSignalIds.length,
            },
            decision: {
              dir,
              confidence,
              entry,
              tp,
              sl,
            },
            outcome: {
              publishedTradeId: trade.rows[0].id,
              publishedSignalId: signal.rows[0].id,
            },
          },
        },
        client,
      );

      return {
        run: run.rows[0],
        trade: trade.rows[0],
        signal: signal.rows[0],
      };
    });

    return json({
      success: true,
      run: {
        id: outcome.run.id,
        userId: outcome.run.user_id,
        selectedSignalIds: outcome.run.selected_signal_ids ?? [],
        draft: outcome.run.draft ?? {},
        published: Boolean(outcome.run.published),
        publishedTradeId: outcome.run.published_trade_id,
        publishedSignalId: outcome.run.published_signal_id,
        createdAt: new Date(outcome.run.created_at).getTime(),
        publishedAt: outcome.run.published_at ? new Date(outcome.run.published_at).getTime() : null,
      },
      trade: {
        id: outcome.trade.id,
        pair: outcome.trade.pair,
        dir: outcome.trade.dir,
        entry: Number(outcome.trade.entry),
        tp: outcome.trade.tp == null ? null : Number(outcome.trade.tp),
        sl: outcome.trade.sl == null ? null : Number(outcome.trade.sl),
        currentPrice: Number(outcome.trade.current_price),
        status: outcome.trade.status,
        openedAt: new Date(outcome.trade.opened_at).getTime(),
      },
      signal: {
        id: outcome.signal.id,
        pair: outcome.signal.pair,
        dir: outcome.signal.dir,
        confidence: Number(outcome.signal.confidence),
        entryPrice: Number(outcome.signal.entry_price),
        currentPrice: Number(outcome.signal.current_price),
        status: outcome.signal.status,
        trackedAt: new Date(outcome.signal.tracked_at).getTime(),
        expiresAt: new Date(outcome.signal.expires_at).getTime(),
      },
    });
  } catch (error: any) {
    if (typeof error?.message === 'string' && error.message.includes('DATABASE_URL is not set')) {
      return json({ error: 'Server database is not configured' }, { status: 500 });
    }
    if (error instanceof SyntaxError) return json({ error: 'Invalid request body' }, { status: 400 });
    console.error('[copy-trades/publish] unexpected error:', error);
    return json({ error: 'Failed to publish copy-trade' }, { status: 500 });
  }
};

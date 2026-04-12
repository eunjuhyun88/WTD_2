import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import {
  normalizePair,
  normalizeTradeDir,
  PAIR_RE,
  toBoundedInt,
  UUID_RE,
} from '$lib/server/apiValidation';
import { saveSignalActionRAG } from '$lib/server/ragService';

const ACTIONS = new Set(['track', 'untrack', 'convert_to_trade', 'copy_trade', 'quick_long', 'quick_short']);

function mapRow(row: any) {
  return {
    id: row.id,
    userId: row.user_id,
    signalId: row.signal_id,
    linkedTradeId: row.linked_trade_id,
    pair: row.pair,
    dir: row.dir,
    actionType: row.action_type,
    source: row.source,
    confidence: row.confidence == null ? null : Number(row.confidence),
    payload: row.payload ?? {},
    createdAt: new Date(row.created_at).getTime(),
  };
}

export const GET: RequestHandler = async ({ cookies, url }) => {
  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });

    const limit = toBoundedInt(url.searchParams.get('limit'), 50, 1, 200);
    const offset = toBoundedInt(url.searchParams.get('offset'), 0, 0, 5000);

    const actionType = (url.searchParams.get('actionType') || '').trim();
    const pair = normalizePair(url.searchParams.get('pair'));

    const whereClauses = ['user_id = $1'];
    const params: unknown[] = [user.id];

    if (actionType) {
      params.push(actionType);
      whereClauses.push(`action_type = $${params.length}`);
    }
    if (pair) {
      params.push(pair);
      whereClauses.push(`pair = $${params.length}`);
    }

    const where = whereClauses.join(' AND ');

    const countResult = await query<{ total: string }>(
      `SELECT count(*)::text AS total FROM signal_actions WHERE ${where}`,
      params
    );

    const listParams = [...params, limit, offset];
    const rows = await query(
      `
        SELECT
          id, user_id, signal_id, linked_trade_id,
          pair, dir, action_type, source, confidence, payload, created_at
        FROM signal_actions
        WHERE ${where}
        ORDER BY created_at DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `,
      listParams
    );

    return json({
      success: true,
      total: Number(countResult.rows[0]?.total ?? '0'),
      records: rows.rows.map(mapRow),
      pagination: { limit, offset },
    });
  } catch (error: any) {
    if (typeof error?.message === 'string' && error.message.includes('DATABASE_URL is not set')) {
      return json({ error: 'Server database is not configured' }, { status: 500 });
    }
    console.error('[signal-actions/get] unexpected error:', error);
    return json({ error: 'Failed to load signal actions' }, { status: 500 });
  }
};

export const POST: RequestHandler = async ({ cookies, request }) => {
  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });

    const body = await request.json();

    const pair = normalizePair(body?.pair);
    const dir = normalizeTradeDir(body?.dir);
    const actionType = typeof body?.actionType === 'string' ? body.actionType.trim() : '';
    const source = typeof body?.source === 'string' ? body.source.trim() : 'manual';
    const confidence = body?.confidence == null ? null : toBoundedInt(body.confidence, 0, 0, 100);

    const signalId = typeof body?.signalId === 'string' && UUID_RE.test(body.signalId) ? body.signalId : null;
    const linkedTradeId =
      typeof body?.linkedTradeId === 'string' && UUID_RE.test(body.linkedTradeId) ? body.linkedTradeId : null;

    const payload = body?.payload && typeof body.payload === 'object' ? body.payload : {};

    if (!PAIR_RE.test(pair)) return json({ error: 'Invalid pair format' }, { status: 400 });
    if (!dir && actionType !== 'untrack') return json({ error: 'dir must be LONG or SHORT' }, { status: 400 });
    if (!ACTIONS.has(actionType)) return json({ error: 'Invalid actionType' }, { status: 400 });

    const insert = await query(
      `
        INSERT INTO signal_actions (
          user_id, signal_id, linked_trade_id, pair, dir,
          action_type, source, confidence, payload, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, now())
        RETURNING
          id, user_id, signal_id, linked_trade_id,
          pair, dir, action_type, source, confidence, payload, created_at
      `,
      [user.id, signalId, linkedTradeId, pair, dir || 'NEUTRAL', actionType, source, confidence, JSON.stringify(payload)]
    );

    await query(
      `
        INSERT INTO activity_events (user_id, event_type, source_page, source_id, severity, payload)
        VALUES ($1, 'signal_tracked', 'signals', $2, 'info', $3::jsonb)
      `,
      [user.id, insert.rows[0].id, JSON.stringify({ actionType, pair, dir: dir || 'NEUTRAL' })]
    ).catch(() => undefined);

    // Decision Memory: Signal Action → RAG (fire-and-forget)
    saveSignalActionRAG(user.id, {
      actionId: insert.rows[0].id,
      pair,
      dir: dir || 'NEUTRAL',
      actionType,
      source,
      confidence,
    }).catch(() => undefined);

    return json({ success: true, action: mapRow(insert.rows[0]) });
  } catch (error: any) {
    if (typeof error?.message === 'string' && error.message.includes('DATABASE_URL is not set')) {
      return json({ error: 'Server database is not configured' }, { status: 500 });
    }
    if (error instanceof SyntaxError) return json({ error: 'Invalid request body' }, { status: 400 });
    console.error('[signal-actions/post] unexpected error:', error);
    return json({ error: 'Failed to create signal action' }, { status: 500 });
  }
};

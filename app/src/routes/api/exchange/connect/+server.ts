// ═══════════════════════════════════════════════════════════════
// COGOCHI — Exchange Connection API
// POST: Register exchange API key
// GET: List connected exchanges
// ═══════════════════════════════════════════════════════════════

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { saveConnection } from '$lib/server/exchange/binanceConnector.js';
import { query } from '$lib/server/db.js';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { userId, exchange, apiKey, apiSecret, label } = body;

    if (!userId || !exchange || !apiKey || !apiSecret) {
      return json({ error: 'userId, exchange, apiKey, apiSecret required' }, { status: 400 });
    }

    if (!['binance', 'bybit', 'okx', 'bitget'].includes(exchange)) {
      return json({ error: 'Unsupported exchange' }, { status: 400 });
    }

    const result = await saveConnection(userId, exchange, apiKey, apiSecret, label);

    if (!result.success) {
      return json({ error: result.error }, { status: 500 });
    }

    return json({ success: true, connectionId: result.id });
  } catch (err: any) {
    console.error('[api/exchange/connect] POST error:', err);
    return json({ error: 'Failed to save connection' }, { status: 500 });
  }
};

export const GET: RequestHandler = async ({ url }) => {
  try {
    const userId = url.searchParams.get('userId');
    if (!userId) {
      return json({ error: 'userId required' }, { status: 400 });
    }

    const result = await query(
      `SELECT id, exchange, label, status, last_synced_at, created_at
       FROM exchange_connections
       WHERE user_id = $1 AND status != 'revoked'
       ORDER BY created_at DESC`,
      [userId],
    );

    return json({ success: true, data: result.rows });
  } catch (err: any) {
    console.error('[api/exchange/connect] GET error:', err);
    return json({ error: 'Failed to fetch connections' }, { status: 500 });
  }
};

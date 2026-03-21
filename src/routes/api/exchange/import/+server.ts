// ═══════════════════════════════════════════════════════════════
// COGOCHI — Trade Import API
// POST: Import trades from connected exchange
// ═══════════════════════════════════════════════════════════════

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { query } from '$lib/server/db.js';
import { fetchBinanceTrades, saveImportedTrades, decryptApiKey } from '$lib/server/exchange/binanceConnector.js';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { userId, connectionId, symbol, startTime } = body;

    if (!userId || !connectionId) {
      return json({ error: 'userId and connectionId required' }, { status: 400 });
    }

    // Get connection details
    const conn = await query<{
      exchange: string;
      api_key_encrypted: string;
      api_secret_encrypted: string;
      status: string;
    }>(
      `SELECT exchange, api_key_encrypted, api_secret_encrypted, status
       FROM exchange_connections
       WHERE id = $1 AND user_id = $2`,
      [connectionId, userId],
    );

    if (conn.rows.length === 0) {
      return json({ error: 'Connection not found' }, { status: 404 });
    }

    const connection = conn.rows[0];
    if (connection.status !== 'active') {
      return json({ error: 'Connection is not active' }, { status: 400 });
    }

    // Decrypt keys
    const apiKey = decryptApiKey(connection.api_key_encrypted);
    const apiSecret = decryptApiKey(connection.api_secret_encrypted);

    // Fetch trades
    const { trades, error } = await fetchBinanceTrades(
      apiKey,
      apiSecret,
      symbol ?? 'BTCUSDT',
      startTime ? Number(startTime) : undefined,
    );

    if (error) {
      // Update connection status on error
      await query(
        `UPDATE exchange_connections SET status = 'error', error_message = $1 WHERE id = $2`,
        [error, connectionId],
      ).catch(() => {});
      return json({ error }, { status: 502 });
    }

    // Save to DB
    const { saved, skipped } = await saveImportedTrades(userId, connectionId, trades);

    return json({
      success: true,
      fetched: trades.length,
      saved,
      skipped,
    });
  } catch (err: any) {
    console.error('[api/exchange/import] POST error:', err);
    return json({ error: 'Failed to import trades' }, { status: 500 });
  }
};

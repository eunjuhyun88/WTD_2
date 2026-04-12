// ═══════════════════════════════════════════════════════════════
// COGOCHI — Trade Import API
// POST: Import trades from connected exchange
// ═══════════════════════════════════════════════════════════════

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { query } from '$lib/server/db.js';
import { fetchBinanceTrades, saveImportedTrades, decryptApiKey } from '$lib/server/exchange/binanceConnector.js';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { runIpRateLimitGuard } from '$lib/server/authSecurity';
import { exchangeImportLimiter } from '$lib/server/rateLimit';
import { isRequestBodyTooLargeError, readJsonBody } from '$lib/server/requestGuards';

export const POST: RequestHandler = async ({ request, cookies, getClientAddress }) => {
  const guard = await runIpRateLimitGuard({
    request,
    fallbackIp: getClientAddress(),
    limiter: exchangeImportLimiter,
    scope: 'exchange:import',
    max: 6,
    tooManyMessage: 'Too many trade import requests. Please wait.',
  });
  if (!guard.ok) return guard.response;

  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) {
      return json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await readJsonBody<Record<string, unknown>>(request, 16 * 1024);
    const requestedUserId = typeof body.userId === 'string' ? body.userId.trim() : '';
    if (requestedUserId && requestedUserId !== user.id) {
      return json({ error: 'Cannot import trades for another user' }, { status: 403 });
    }

    const connectionId = typeof body.connectionId === 'string' ? body.connectionId.trim() : '';
    const symbol = typeof body.symbol === 'string' ? body.symbol.trim() : undefined;
    const startTimeRaw = body.startTime;
    const startTime = typeof startTimeRaw === 'number'
      ? startTimeRaw
      : typeof startTimeRaw === 'string' && startTimeRaw.trim()
        ? Number(startTimeRaw)
        : undefined;

    if (!connectionId) {
      return json({ error: 'connectionId required' }, { status: 400 });
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
      [connectionId, user.id],
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
      Number.isFinite(startTime) ? Number(startTime) : undefined,
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
    const { saved, skipped } = await saveImportedTrades(user.id, connectionId, trades);

    return json(
      {
        success: true,
        fetched: trades.length,
        saved,
        skipped,
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  } catch (err: any) {
    if (isRequestBodyTooLargeError(err)) {
      return json({ error: 'Request body too large' }, { status: 413 });
    }
    if (err instanceof SyntaxError) {
      return json({ error: 'Invalid request body' }, { status: 400 });
    }
    console.error('[api/exchange/import] POST error:', err);
    return json({ error: 'Failed to import trades' }, { status: 500 });
  }
};

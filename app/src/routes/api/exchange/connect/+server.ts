// ═══════════════════════════════════════════════════════════════
// COGOCHI — Exchange Connection API
// POST: Register exchange API key
// GET: List connected exchanges
// ═══════════════════════════════════════════════════════════════

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { isExchangeEncryptionConfigured, saveConnection } from '$lib/server/exchange/binanceConnector.js';
import { query } from '$lib/server/db.js';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { runIpRateLimitGuard } from '$lib/server/authSecurity';
import { exchangeConnectionLimiter } from '$lib/server/rateLimit';
import { isRequestBodyTooLargeError, readJsonBody } from '$lib/server/requestGuards';

export const POST: RequestHandler = async ({ request, cookies, getClientAddress }) => {
  const guard = await runIpRateLimitGuard({
    request,
    fallbackIp: getClientAddress(),
    limiter: exchangeConnectionLimiter,
    scope: 'exchange:connect',
    max: 10,
    tooManyMessage: 'Too many exchange connection requests. Please wait.',
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
      return json({ error: 'Cannot manage another user connection' }, { status: 403 });
    }

    const exchange = typeof body.exchange === 'string' ? body.exchange.trim() : '';
    const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
    const apiSecret = typeof body.apiSecret === 'string' ? body.apiSecret.trim() : '';
    const label = typeof body.label === 'string' ? body.label.trim() : undefined;

    if (!exchange || !apiKey || !apiSecret) {
      return json({ error: 'exchange, apiKey, apiSecret required' }, { status: 400 });
    }

    if (!['binance', 'bybit', 'okx', 'bitget'].includes(exchange)) {
      return json({ error: 'Unsupported exchange' }, { status: 400 });
    }

    if (!isExchangeEncryptionConfigured()) {
      return json({ error: 'Exchange connections are unavailable' }, { status: 503 });
    }

    const result = await saveConnection(user.id, exchange, apiKey, apiSecret, label);

    if (!result.success) {
      return json({ error: result.error }, { status: 500 });
    }

    return json(
      { success: true, connectionId: result.id },
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
    console.error('[api/exchange/connect] POST error:', err);
    return json({ error: 'Failed to save connection' }, { status: 500 });
  }
};

export const GET: RequestHandler = async ({ url, cookies, request, getClientAddress }) => {
  const guard = await runIpRateLimitGuard({
    request,
    fallbackIp: getClientAddress(),
    limiter: exchangeConnectionLimiter,
    scope: 'exchange:connect:list',
    max: 10,
    tooManyMessage: 'Too many exchange connection requests. Please wait.',
  });
  if (!guard.ok) return guard.response;

  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) {
      return json({ error: 'Authentication required' }, { status: 401 });
    }

    const requestedUserId = (url.searchParams.get('userId') || '').trim();
    if (requestedUserId && requestedUserId !== user.id) {
      return json({ error: 'Cannot read another user connections' }, { status: 403 });
    }

    const result = await query(
      `SELECT id, exchange, label, status, last_synced_at, created_at
       FROM exchange_connections
       WHERE user_id = $1 AND status != 'revoked'
       ORDER BY created_at DESC`,
      [user.id],
    );

    return json(
      { success: true, data: result.rows },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  } catch (err: any) {
    console.error('[api/exchange/connect] GET error:', err);
    return json({ error: 'Failed to fetch connections' }, { status: 500 });
  }
};

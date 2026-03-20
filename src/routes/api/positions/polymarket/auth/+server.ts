// ═══════════════════════════════════════════════════════════════
// Stockclaw — Polymarket Auth API
// ═══════════════════════════════════════════════════════════════
// Two endpoints:
//   GET  → Returns EIP-712 typed data for ClobAuth (L1 signing)
//   POST → Takes wallet signature, derives L2 API creds, stores in DB
//
// This is a one-time setup per user wallet.

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { query } from '$lib/server/db';
import { buildAuthTypedData, deriveApiCredentials } from '$lib/server/polymarketClob';
import { polymarketOrderLimiter } from '$lib/server/rateLimit';
import { encryptSecret, isSecretsEncryptionConfigured } from '$lib/server/secretCrypto';
import { runIpRateLimitGuard } from '$lib/server/authSecurity';
import { isRequestBodyTooLargeError, readJsonBody } from '$lib/server/requestGuards';

const ETH_ADDRESS_RE = /^0x[0-9a-f]{40}$/i;

/**
 * GET — Build ClobAuth EIP-712 typed data for the user to sign.
 * Query params: walletAddress
 */
export const GET: RequestHandler = async ({ cookies, url, getClientAddress, request }) => {
  const fallbackIp = getClientAddress();
  const guard = await runIpRateLimitGuard({
    request,
    fallbackIp,
    limiter: polymarketOrderLimiter,
    scope: 'polymarket:auth:get',
    max: 10,
    tooManyMessage: 'Too many requests.',
  });
  if (!guard.ok) return guard.response;

  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });

    const walletAddress = url.searchParams.get('walletAddress') ?? '';
    if (!ETH_ADDRESS_RE.test(walletAddress)) {
      return json({ error: 'Invalid wallet address' }, { status: 400 });
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const nonce = 0;
    const typedData = buildAuthTypedData(walletAddress, timestamp, nonce);

    return json({
      ok: true,
      typedData,
      timestamp,
      nonce,
    });
  } catch (error: unknown) {
    console.error('[polymarket/auth GET] error:', error);
    return json({ error: 'Failed to build auth data' }, { status: 500 });
  }
};

/**
 * POST — Derive L2 API credentials from wallet signature and store in DB.
 * Body: { walletAddress, signature, timestamp, nonce }
 */
export const POST: RequestHandler = async ({ cookies, request, getClientAddress }) => {
  const fallbackIp = getClientAddress();
  const guard = await runIpRateLimitGuard({
    request,
    fallbackIp,
    limiter: polymarketOrderLimiter,
    scope: 'polymarket:auth:post',
    max: 10,
    tooManyMessage: 'Too many requests.',
  });
  if (!guard.ok) return guard.response;

  try {
    const user = await getAuthUserFromCookies(cookies);
    if (!user) return json({ error: 'Authentication required' }, { status: 401 });

    const body = await readJsonBody<Record<string, unknown>>(request, 16 * 1024);
    if (!body) return json({ error: 'Invalid request body' }, { status: 400 });

    const walletAddress = body.walletAddress;
    const signature = body.signature;
    const timestamp = body.timestamp;
    const nonceRaw = body.nonce;
    const nonce = typeof nonceRaw === 'number' && Number.isFinite(nonceRaw)
      ? Math.trunc(nonceRaw)
      : 0;

    if (typeof walletAddress !== 'string' || !ETH_ADDRESS_RE.test(walletAddress)) {
      return json({ error: 'Invalid wallet address' }, { status: 400 });
    }
    if (typeof signature !== 'string' || !signature.startsWith('0x')) {
      return json({ error: 'Invalid signature' }, { status: 400 });
    }
    if (typeof timestamp !== 'number') {
      return json({ error: 'timestamp is required' }, { status: 400 });
    }

    // Check timestamp is recent (within 5 minutes)
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - timestamp) > 300) {
      return json({ error: 'Signature expired. Please try again.' }, { status: 410 });
    }

    // Derive L2 credentials from CLOB API
    const creds = await deriveApiCredentials(walletAddress, signature, timestamp, nonce);
    if (!creds) {
      return json({ error: 'Failed to derive Polymarket API credentials' }, { status: 502 });
    }

    if (!isSecretsEncryptionConfigured()) {
      return json({ error: 'Server secret encryption is not configured' }, { status: 503 });
    }

    // Store L2 credentials in users table
    await query(
      `UPDATE users
       SET poly_api_key = $1, poly_secret = $2, poly_passphrase = $3,
           poly_wallet_address = $4, updated_at = now()
       WHERE id = $5`,
      [
        encryptSecret(creds.apiKey),
        encryptSecret(creds.secret),
        encryptSecret(creds.passphrase),
        walletAddress,
        user.id,
      ],
    );

    // Log activity
    await query(
      `INSERT INTO activity_events (user_id, event_type, source_page, severity, payload)
       VALUES ($1, 'polymarket_auth', 'terminal', 'info', $2::jsonb)`,
      [user.id, JSON.stringify({ walletAddress })],
    ).catch(() => undefined);

    return json({
      ok: true,
      authenticated: true,
    });
  } catch (error: unknown) {
    if (isRequestBodyTooLargeError(error)) {
      return json({ error: 'Request body too large' }, { status: 413 });
    }
    if (error instanceof SyntaxError) {
      return json({ error: 'Invalid request body' }, { status: 400 });
    }
    console.error('[polymarket/auth POST] error:', error);
    return json({ error: 'Failed to authenticate with Polymarket' }, { status: 500 });
  }
};

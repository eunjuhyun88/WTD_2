// ═══════════════════════════════════════════════════════════════
// Stockclaw — Unified Wallet-First Auth API
// POST /api/auth/wallet-auth
// Body: { walletAddress, walletMessage, walletSignature }
//
// Flow:
//   1. Verify wallet signature (consume nonce)
//   2. Look up user by wallet_address
//   3a. If found → auto-login, return { action: 'login', user }
//   3b. If not found → return { action: 'signup' } (client shows email form)
// ═══════════════════════════════════════════════════════════════

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createAuthSession, findAuthUserByWallet } from '$lib/server/authRepository';
import {
  buildSessionCookieValue,
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_OPTIONS,
  SESSION_MAX_AGE_SEC,
} from '$lib/server/session';
import {
  isValidEthAddress,
  normalizeEthAddress,
  verifyAndConsumeEvmNonce,
} from '$lib/server/walletAuthRepository';
import { authLoginLimiter } from '$lib/server/rateLimit';
import { readAuthBodyWithTurnstile, runAuthAbuseGuard } from '$lib/server/authSecurity';

const EVM_SIGNATURE_RE = /^0x[0-9a-f]{130}$/i;

export const POST: RequestHandler = async ({ request, cookies, getClientAddress }) => {
  const fallbackIp = getClientAddress();
  const guard = await runAuthAbuseGuard({
    request,
    fallbackIp,
    limiter: authLoginLimiter,
    scope: 'auth:wallet-auth',
    max: 10,
    tooManyMessage: 'Too many attempts. Please wait.',
  });
  if (!guard.ok) return guard.response;

  try {
    const bodyResult = await readAuthBodyWithTurnstile({
      request,
      remoteIp: guard.remoteIp,
      maxBytes: 16 * 1024,
    });
    if (!bodyResult.ok) return bodyResult.response;
    const body = bodyResult.body;

    const walletAddressRaw = typeof body?.walletAddress === 'string' ? body.walletAddress.trim() : '';
    const walletMessage = typeof body?.walletMessage === 'string'
      ? body.walletMessage.trim()
      : typeof body?.message === 'string'
        ? body.message.trim()
        : '';
    const walletSignature = typeof body?.walletSignature === 'string'
      ? body.walletSignature.trim()
      : typeof body?.signature === 'string'
        ? body.signature.trim()
        : '';

    // ── Validate wallet fields ──
    if (!isValidEthAddress(walletAddressRaw)) {
      return json({ error: 'Valid EVM wallet address required' }, { status: 400 });
    }
    if (!walletMessage) {
      return json({ error: 'Signed wallet message is required' }, { status: 400 });
    }
    if (walletMessage.length > 2048) {
      return json({ error: 'Signed wallet message is too long' }, { status: 400 });
    }
    if (!EVM_SIGNATURE_RE.test(walletSignature)) {
      return json({ error: 'Valid wallet signature is required' }, { status: 400 });
    }

    const walletAddress = normalizeEthAddress(walletAddressRaw);

    // ── Verify signature & consume nonce ──
    const verification = await verifyAndConsumeEvmNonce({
      address: walletAddress,
      message: walletMessage,
      signature: walletSignature,
    });

    if (verification === 'missing_nonce') {
      return json({ error: 'Nonce not found in signed message' }, { status: 400 });
    }
    if (verification === 'invalid_signature') {
      return json({ error: 'Signature does not match wallet address' }, { status: 401 });
    }
    if (verification === 'invalid_nonce') {
      return json({ error: 'Challenge is expired or already used' }, { status: 401 });
    }

    // ── Check if user exists ──
    const existingUser = await findAuthUserByWallet(walletAddress);

    if (existingUser) {
      // Auto-login: create session and return user
      const sessionToken = crypto.randomUUID().toLowerCase();
      const createdAt = Date.now();
      const expiresAtMs = createdAt + SESSION_MAX_AGE_SEC * 1000;
      await createAuthSession({
        token: sessionToken,
        userId: existingUser.id,
        expiresAtIso: new Date(expiresAtMs).toISOString(),
        userAgent: request.headers.get('user-agent'),
        ipAddress: guard.ip,
      });

      cookies.set(
        SESSION_COOKIE_NAME,
        buildSessionCookieValue(sessionToken, existingUser.id),
        SESSION_COOKIE_OPTIONS
      );

      return json({
        success: true,
        action: 'login',
        user: {
          id: existingUser.id,
          email: existingUser.email,
          nickname: existingUser.nickname,
          tier: existingUser.tier,
          phase: existingUser.phase,
          walletAddress: existingUser.wallet_address,
          loggedInAt: new Date(createdAt).toISOString(),
        },
      });
    }

    // ── New user: tell client to show signup form ──
    return json({
      success: true,
      action: 'signup',
      walletAddress,
      message: 'Wallet verified. Please provide email and nickname to complete registration.',
    });
  } catch (error: any) {
    if (typeof error?.message === 'string' && error.message.includes('DATABASE_URL is not set')) {
      return json({ error: 'Server database is not configured' }, { status: 500 });
    }
    console.error('[auth/wallet-auth] unexpected error:', error);
    return json({ error: 'Authentication failed' }, { status: 500 });
  }
};

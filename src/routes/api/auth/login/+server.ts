import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createAuthSession, findAuthUserForLogin } from '$lib/server/authRepository';
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
    scope: 'auth:login',
    max: 10,
    tooManyMessage: 'Too many login attempts. Please wait.',
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

    const email = typeof body?.email === 'string' ? body.email.trim() : '';
    const nickname = typeof body?.nickname === 'string' ? body.nickname.trim() : '';
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

    if (!email || !email.includes('@')) {
      return json({ error: 'Valid email required' }, { status: 400 });
    }
    if (email.length > 254) {
      return json({ error: 'Email is too long' }, { status: 400 });
    }
    if (!nickname || nickname.length < 2) {
      return json({ error: 'Nickname must be 2+ characters' }, { status: 400 });
    }
    if (nickname.length > 32) {
      return json({ error: 'Nickname must be 32 characters or less' }, { status: 400 });
    }
    if (!isValidEthAddress(walletAddressRaw)) {
      return json({ error: 'Valid EVM wallet address required for login' }, { status: 400 });
    }
    if (!walletMessage) {
      return json({ error: 'Signed wallet message is required for login' }, { status: 400 });
    }
    if (walletMessage.length > 2048) {
      return json({ error: 'Signed wallet message is too long' }, { status: 400 });
    }
    if (!EVM_SIGNATURE_RE.test(walletSignature)) {
      return json({ error: 'Valid wallet signature is required for login' }, { status: 400 });
    }

    const walletAddress = normalizeEthAddress(walletAddressRaw);
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
      return json({ error: 'Login challenge is expired or already used' }, { status: 401 });
    }

    const user = await findAuthUserForLogin(email, nickname, walletAddress);
    if (!user) {
      return json({ error: 'Invalid login credentials or wallet mismatch' }, { status: 401 });
    }

    const sessionToken = crypto.randomUUID().toLowerCase();
    const createdAt = Date.now();
    const expiresAtMs = createdAt + SESSION_MAX_AGE_SEC * 1000;
    await createAuthSession({
      token: sessionToken,
      userId: user.id,
      expiresAtIso: new Date(expiresAtMs).toISOString(),
      userAgent: request.headers.get('user-agent'),
      ipAddress: guard.ip,
    });

    cookies.set(
      SESSION_COOKIE_NAME,
      buildSessionCookieValue(sessionToken, user.id),
      SESSION_COOKIE_OPTIONS
    );

    return json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        nickname: user.nickname,
        tier: user.tier,
        phase: user.phase,
        walletAddress: user.wallet_address,
        loggedInAt: new Date(createdAt).toISOString(),
      },
    });
  } catch (error: any) {
    if (typeof error?.message === 'string' && error.message.includes('DATABASE_URL is not set')) {
      return json({ error: 'Server database is not configured' }, { status: 500 });
    }
    console.error('[auth/login] unexpected error:', error);
    return json({ error: 'Failed to login' }, { status: 500 });
  }
};

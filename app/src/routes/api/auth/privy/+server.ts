// POST /api/auth/privy
// Accepts a Privy access token, verifies it via Privy JWKS, issues a session cookie.
// Requires: PRIVY_APP_SECRET and PUBLIC_PRIVY_APP_ID env vars.

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { env as pubEnv } from '$env/dynamic/public';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { createAuthSession, findAuthUserByWallet, createWalletOnlyUser } from '$lib/server/authRepository';
import {
  buildSessionCookieValue,
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_OPTIONS,
  SESSION_MAX_AGE_SEC,
} from '$lib/server/session';

export const POST: RequestHandler = async ({ request, cookies }) => {
  const appSecret = env.PRIVY_APP_SECRET;
  const appId = pubEnv.PUBLIC_PRIVY_APP_ID;

  if (!appSecret || !appId) {
    return json({ error: 'Privy not configured' }, { status: 501 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid request body' }, { status: 400 });
  }

  const accessToken = typeof (body as any)?.accessToken === 'string'
    ? (body as any).accessToken.trim()
    : '';

  if (!accessToken) {
    return json({ error: 'accessToken is required' }, { status: 400 });
  }

  let walletAddress: string;
  try {
    const jwksUrl = new URL(`https://auth.privy.io/api/v1/apps/${appId}/jwks.json`);
    const JWKS = createRemoteJWKSet(jwksUrl);
    const { payload } = await jwtVerify(accessToken, JWKS, { audience: appId });
    const sub = typeof payload.sub === 'string' ? payload.sub : '';
    // Privy sub format: "did:privy:<id>" — the embedded wallet address is in custom claim.
    // Privy also embeds `linked_accounts` with type=wallet. Fallback: use sub directly if EVM addr.
    const linked = Array.isArray((payload as any).linked_accounts)
      ? (payload as any).linked_accounts
      : [];
    const walletEntry = linked.find(
      (a: any) => a.type === 'wallet' && typeof a.address === 'string' && /^0x[0-9a-fA-F]{40}$/.test(a.address)
    );
    if (walletEntry) {
      walletAddress = (walletEntry.address as string).toLowerCase();
    } else if (/^0x[0-9a-fA-F]{40}$/.test(sub)) {
      walletAddress = sub.toLowerCase();
    } else {
      return json({ error: 'No wallet address found in Privy token' }, { status: 400 });
    }
  } catch (err: any) {
    console.error('[auth/privy] JWT verification failed:', err?.message ?? err);
    return json({ error: 'Invalid or expired Privy token' }, { status: 401 });
  }

  try {
    let user = await findAuthUserByWallet(walletAddress);
    if (!user) {
      try {
        user = await createWalletOnlyUser(walletAddress, '');
      } catch (createError: any) {
        if (createError?.code === '23505') {
          user = await findAuthUserByWallet(walletAddress);
        }
        if (!user) throw createError;
      }
    }

    const sessionToken = crypto.randomUUID().toLowerCase();
    const createdAt = Date.now();
    const expiresAtMs = createdAt + SESSION_MAX_AGE_SEC * 1000;
    await createAuthSession({
      token: sessionToken,
      userId: user.id,
      expiresAtIso: new Date(expiresAtMs).toISOString(),
      userAgent: request.headers.get('user-agent'),
      ipAddress: null,
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
      },
    });
  } catch (error: any) {
    console.error('[auth/privy] session creation failed:', error);
    return json({ error: 'Authentication failed' }, { status: 500 });
  }
};

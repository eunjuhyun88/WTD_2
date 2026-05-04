// POST /api/auth/privy
// Accepts a Privy access token, verifies it via Privy JWKS, issues a session cookie.
// Requires: PRIVY_APP_SECRET and PUBLIC_PRIVY_APP_ID env vars.

// POST /api/auth/privy
// Accepts a Privy access token, verifies it via Privy JWKS, issues a session cookie.
// Supports both wallet-linked users and email-only users (no EVM address in JWT).
// Requires: PRIVY_APP_SECRET and PUBLIC_PRIVY_APP_ID env vars.

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { env as pubEnv } from '$env/dynamic/public';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import {
  createAuthSession,
  findAuthUserByWallet,
  createWalletOnlyUser,
  findAuthUserByEmail,
  createEmailOnlyUser,
} from '$lib/server/authRepository';
import {
  buildSessionCookieValue,
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_OPTIONS,
  SESSION_MAX_AGE_SEC,
} from '$lib/server/session';

export const POST: RequestHandler = async ({ request, cookies, getClientAddress }) => {
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
  // email hint: client extracts it from result.user.linked_accounts (trusted only after JWT verify)
  const emailHint = typeof (body as any)?.email === 'string'
    ? (body as any).email.trim().toLowerCase()
    : '';

  if (!accessToken) {
    return json({ error: 'accessToken is required' }, { status: 400 });
  }

  // Verified claims from the Privy JWT
  let walletAddress: string | null = null;
  let privyEmail: string | null = null;
  let privySub: string = '';

  try {
    const jwksUrl = new URL(`https://auth.privy.io/api/v1/apps/${appId}/jwks.json`);
    const JWKS = createRemoteJWKSet(jwksUrl);
    const { payload } = await jwtVerify(accessToken, JWKS, { audience: appId });
    privySub = typeof payload.sub === 'string' ? payload.sub : '';

    // identity_token embeds linked_accounts; customer access token may not
    const linked = Array.isArray((payload as any).linked_accounts)
      ? (payload as any).linked_accounts
      : [];

    // Extract EVM wallet address (optional — email-only users have none)
    const walletEntry = linked.find(
      (a: any) => a.type === 'wallet' && typeof a.address === 'string' && /^0x[0-9a-fA-F]{40}$/.test(a.address)
    );
    if (walletEntry) {
      walletAddress = (walletEntry.address as string).toLowerCase();
    } else if (/^0x[0-9a-fA-F]{40}$/.test(privySub)) {
      walletAddress = privySub.toLowerCase();
    }

    // Extract email from linked_accounts (identity_token path)
    const emailEntry = linked.find(
      (a: any) => a.type === 'email' && typeof a.address === 'string' && a.address.includes('@')
    );
    if (emailEntry) {
      privyEmail = (emailEntry.address as string).trim().toLowerCase();
    }

    // Fallback: use client-supplied email hint (JWT verified above — hint is trusted post-verify)
    if (!walletAddress && !privyEmail && emailHint.includes('@')) {
      privyEmail = emailHint;
    }

    // Must have at least one usable identifier
    if (!walletAddress && !privyEmail) {
      return json({ error: 'No wallet address or email found in Privy token' }, { status: 400 });
    }
  } catch (err: any) {
    console.error('[auth/privy] JWT verification failed:', err?.message ?? err);
    return json({ error: 'Invalid or expired Privy token' }, { status: 401 });
  }

  try {
    let user = null;

    if (walletAddress) {
      // Wallet path: find or create by wallet address
      user = await findAuthUserByWallet(walletAddress);
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
    } else if (privyEmail) {
      // Email-only path: find or create by email (no wallet address)
      user = await findAuthUserByEmail(privyEmail);
      if (!user) {
        try {
          user = await createEmailOnlyUser(privyEmail, privySub);
        } catch (createError: any) {
          if (createError?.code === '23505') {
            user = await findAuthUserByEmail(privyEmail);
          }
          if (!user) throw createError;
        }
      }
    }

    if (!user) {
      return json({ error: 'Failed to resolve user' }, { status: 500 });
    }

    const sessionToken = crypto.randomUUID().toLowerCase();
    const createdAt = Date.now();
    const expiresAtMs = createdAt + SESSION_MAX_AGE_SEC * 1000;
    await createAuthSession({
      token: sessionToken,
      userId: user.id,
      expiresAtIso: new Date(expiresAtMs).toISOString(),
      userAgent: request.headers.get('user-agent'),
      ipAddress: getClientAddress(),
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

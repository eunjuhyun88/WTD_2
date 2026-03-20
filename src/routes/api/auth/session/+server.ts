// ═══════════════════════════════════════════════════════════════
// Stockclaw — Session Check API
// GET /api/auth/session
// Returns current user session status from cookie
// ═══════════════════════════════════════════════════════════════

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAuthenticatedUser } from '$lib/server/authRepository';
import { parseSessionCookie, SESSION_COOKIE_NAME } from '$lib/server/session';

export const GET: RequestHandler = async ({ cookies }) => {
  const sessionCookie = cookies.get(SESSION_COOKIE_NAME);

  if (!sessionCookie) {
    return json({
      authenticated: false,
      user: null
    });
  }

  const parsed = parseSessionCookie(sessionCookie);
  if (!parsed) {
    cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
    return json({
      authenticated: false,
      user: null
    });
  }

  try {
    const user = await getAuthenticatedUser(parsed.token, parsed.userId);
    if (!user) {
      cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
      return json({
        authenticated: false,
        user: null
      });
    }

    return json({
      authenticated: true,
      user: {
        id: user.id,
        email: user.email,
        nickname: user.nickname,
        tier: user.tier,
        phase: user.phase,
        wallet: user.wallet_address
      }
    });
  } catch (error) {
    console.error('[auth/session] unexpected error:', error);
    cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
    return json({
      authenticated: false,
      user: null
    });
  }
};

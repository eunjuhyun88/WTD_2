import type { Cookies } from '@sveltejs/kit';
import { getAuthenticatedUser, type AuthUserRow } from './authRepository';
import { parseSessionCookie, SESSION_COOKIE_NAME } from './session';
import { getHotCached } from './hotCache';
import { query } from './db';

// Cache valid sessions for 45s to avoid a DB hit on every page request.
// Trade-off: logout/revocation takes effect within 45s. Acceptable for this use case.
// At 500 users x 10 req/min, this reduces DB auth queries by ~97%.
const SESSION_CACHE_TTL_MS = 45_000;

export async function getAuthUserFromCookies(cookies: Cookies): Promise<AuthUserRow | null> {
  const raw = cookies.get(SESSION_COOKIE_NAME);
  const parsed = parseSessionCookie(raw);
  if (!parsed) return null;

  const cacheKey = `session:${parsed.token}:${parsed.userId}`;
  let user: AuthUserRow | null;
  try {
    user = await getHotCached<AuthUserRow | null>(
      cacheKey,
      SESSION_CACHE_TTL_MS,
      () => getAuthenticatedUser(parsed.token, parsed.userId),
    );
  } catch (error) {
    console.error('[authGuard] session hydrate failed:', error);
    cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
    return null;
  }

  if (!user) {
    cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
    return null;
  }

  return user;
}

const BETA_ALLOWLIST_TTL_MS = 45_000;

/**
 * B1: Check whether a user is in the active beta allowlist.
 * Accepts wallet address and/or email — tries wallet first, then email fallback.
 * Returns true if allowed.
 * Cached for 45s alongside session cache to avoid extra DB round-trips.
 *
 * BYPASS: if BETA_OPEN env var is set to "true", skip the check entirely.
 */
export async function checkBetaAllowlist(
  walletAddress: string | null,
  email?: string | null,
): Promise<boolean> {
  if (process.env.BETA_OPEN === 'true') return true;

  // Check by wallet address first
  if (walletAddress) {
    const normalized = walletAddress.toLowerCase().trim();
    const cacheKey = `betaAllow:wallet:${normalized}`;
    const allowed = await getHotCached<boolean>(
      cacheKey,
      BETA_ALLOWLIST_TTL_MS,
      async () => {
        try {
          const result = await query<{ wallet_address: string }>(
            'SELECT wallet_address FROM beta_allowlist WHERE wallet_address = $1 AND revoked_at IS NULL LIMIT 1',
            [normalized],
          );
          return result.rows.length > 0;
        } catch {
          // On DB error, fail open so a DB outage doesn't lock out users
          return true;
        }
      },
    );
    if (allowed) return true;
  }

  // Fallback: check by email (for email-only Privy users with no wallet)
  if (email) {
    const normalizedEmail = email.toLowerCase().trim();
    const cacheKey = `betaAllow:email:${normalizedEmail}`;
    return getHotCached<boolean>(
      cacheKey,
      BETA_ALLOWLIST_TTL_MS,
      async () => {
        try {
          const result = await query<{ email: string }>(
            'SELECT email FROM beta_allowlist WHERE lower(email) = $1 AND revoked_at IS NULL LIMIT 1',
            [normalizedEmail],
          );
          return result.rows.length > 0;
        } catch {
          // On DB error, fail open
          return true;
        }
      },
    );
  }

  return false;
}

import type { Cookies } from '@sveltejs/kit';
import { getAuthenticatedUser, type AuthUserRow } from './authRepository';
import { parseSessionCookie, SESSION_COOKIE_NAME } from './session';

export async function getAuthUserFromCookies(cookies: Cookies): Promise<AuthUserRow | null> {
  const raw = cookies.get(SESSION_COOKIE_NAME);
  const parsed = parseSessionCookie(raw);
  if (!parsed) return null;

  const user = await getAuthenticatedUser(parsed.token, parsed.userId);
  if (!user) {
    cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
    return null;
  }

  return user;
}

import { dev } from '$app/environment';

export const SESSION_COOKIE_NAME = 'stockclaw_session';
export const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 30; // 30 days

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ParsedSessionCookie {
  token: string;
  userId: string;
}

export function buildSessionCookieValue(token: string, userId: string): string {
  return `${token}:${userId}`;
}

export function parseSessionCookie(raw: string | undefined): ParsedSessionCookie | null {
  if (!raw) return null;
  const value = raw.trim();
  if (!value || value.length > 200) return null;

  const parts = value.split(':');
  if (parts.length !== 2) return null;

  const [token, userId] = parts;
  if (!UUID_RE.test(token) || !UUID_RE.test(userId)) return null;

  return {
    token: token.toLowerCase(),
    userId: userId.toLowerCase(),
  };
}

export const SESSION_COOKIE_OPTIONS = {
  path: '/',
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: !dev,
  maxAge: SESSION_MAX_AGE_SEC,
};

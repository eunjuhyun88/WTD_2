import { json, type RequestEvent } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { SESSION_COOKIE_NAME } from './session';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const SAME_SITE_FETCH_SITES = new Set(['same-origin', 'same-site', 'none']);

function envBool(name: string, fallback: boolean): boolean {
  const raw = env[name as keyof typeof env];
  if (typeof raw !== 'string') return fallback;
  const normalized = raw.trim().toLowerCase();
  if (!normalized) return fallback;
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function normalizeOrigin(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed === 'null') return null;
  try {
    return new URL(trimmed).origin;
  } catch {
    return null;
  }
}

function normalizeFetchSite(raw: string | null): string | null {
  if (!raw) return null;
  const normalized = raw.trim().toLowerCase();
  return normalized || null;
}

function parseAllowedOrigins(localOrigin: string): Set<string> {
  const out = new Set<string>([localOrigin]);
  const configured = env.SECURITY_ALLOWED_ORIGINS?.trim() || '';
  if (!configured) return out;

  for (const item of configured.split(',')) {
    const candidate = item.trim();
    if (!candidate) continue;
    try {
      out.add(new URL(candidate).origin);
    } catch {
      // ignore malformed origin entries
    }
  }
  return out;
}

function hasSessionCookie(request: Request): boolean {
  const cookie = request.headers.get('cookie');
  if (!cookie) return false;
  return cookie.includes(`${SESSION_COOKIE_NAME}=`);
}

function isMutatingApiRequest(event: RequestEvent): boolean {
  if (!event.url.pathname.startsWith('/api/')) return false;
  return MUTATING_METHODS.has(event.request.method.toUpperCase());
}

function blocked(reason: string): Response {
  return json({ error: reason }, { status: 403 });
}

export function runMutatingApiOriginGuard(event: RequestEvent): Response | null {
  if (!envBool('SECURITY_ORIGIN_GUARD_ENABLED', true)) return null;
  if (!isMutatingApiRequest(event)) return null;

  const origin = normalizeOrigin(event.request.headers.get('origin'));
  const fetchSite = normalizeFetchSite(event.request.headers.get('sec-fetch-site'));

  if (origin) {
    const allowedOrigins = parseAllowedOrigins(event.url.origin);
    if (allowedOrigins.has(origin)) return null;
    return blocked('Cross-origin mutating API request blocked');
  }

  if (fetchSite && SAME_SITE_FETCH_SITES.has(fetchSite)) {
    return null;
  }

  if (fetchSite && !SAME_SITE_FETCH_SITES.has(fetchSite)) {
    return blocked('Cross-site mutating API request blocked');
  }

  if (!hasSessionCookie(event.request)) {
    return null;
  }

  if (envBool('SECURITY_ALLOW_SESSION_MUTATION_WITHOUT_ORIGIN', false)) {
    return null;
  }

  return blocked('Missing origin metadata for session mutation');
}

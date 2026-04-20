import { env } from '$env/dynamic/private';

type EnvLike = Record<string, string | undefined>;

function envBool(value: string | undefined, fallback: boolean): boolean {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return fallback;
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function normalizeHost(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const first = raw.split(',')[0]?.trim().toLowerCase();
  if (!first) return null;
  // Strip port suffix (e.g. "example.com:443" → "example.com")
  const withoutPort = first.replace(/:\d+$/, '');
  // Strip trailing DNS dot (e.g. "example.com." → "example.com")
  const withoutDot = withoutPort.replace(/\.$/, '');
  return withoutDot || null;
}

function parseConfiguredHosts(raw: string | undefined): Set<string> {
  const allowed = new Set<string>();
  const value = raw?.trim() || '';
  if (!value) return allowed;

  for (const part of value.split(',')) {
    const normalized = normalizeHost(part);
    if (normalized) allowed.add(normalized);
  }

  return allowed;
}

export function getAllowedHosts(envLike: EnvLike = env): Set<string> {
  return parseConfiguredHosts(envLike.SECURITY_ALLOWED_HOSTS);
}

export function isHostAllowed(requestHost: string | null, envLike: EnvLike = env): boolean {
  const normalizedHost = normalizeHost(requestHost);
  if (!normalizedHost) return true;

  const allowedHosts = getAllowedHosts(envLike);
  if (allowedHosts.size === 0) return true;

  return allowedHosts.has(normalizedHost);
}

export function readRequestHost(request: Request, envLike: EnvLike = env): string | null {
  const trustProxyHeaders = envBool(envLike.SECURITY_TRUST_PROXY_HEADERS, false);
  if (trustProxyHeaders) {
    const forwardedHost = normalizeHost(request.headers.get('x-forwarded-host'));
    if (forwardedHost) return forwardedHost;
  }
  return normalizeHost(request.headers.get('host'));
}

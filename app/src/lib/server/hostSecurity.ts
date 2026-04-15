import { env } from '$env/dynamic/private';

type EnvLike = Record<string, string | undefined>;

function normalizeHost(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const first = raw.split(',')[0]?.trim().toLowerCase();
  if (!first) return null;
  return first;
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

export function readRequestHost(request: Request): string | null {
  return normalizeHost(request.headers.get('x-forwarded-host') ?? request.headers.get('host'));
}

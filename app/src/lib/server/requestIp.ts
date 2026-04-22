import { isIP } from 'node:net';

function sanitizeIp(raw?: string | null): string | null {
  if (!raw) return null;
  const first = raw.split(',')[0]?.trim() || '';
  if (!first) return null;

  const ipv4WithPort = first.match(/^(\d{1,3}(?:\.\d{1,3}){3})(?::\d+)?$/);
  if (ipv4WithPort?.[1] && isIP(ipv4WithPort[1]) === 4) {
    return ipv4WithPort[1];
  }

  const bracketedIpv6 = first.match(/^\[([0-9a-fA-F:]+)\](?::\d+)?$/);
  if (bracketedIpv6?.[1] && isIP(bracketedIpv6[1]) === 6) {
    return bracketedIpv6[1];
  }

  return isIP(first) > 0 ? first : null;
}

export function getRequestIp(args: {
  request?: Request;
  getClientAddress?: (() => string) | null;
  fallback?: string | null;
}): string {
  try {
    const direct = sanitizeIp(args.getClientAddress?.());
    if (direct) return direct;
  } catch {
    // SvelteKit can throw in dev/SSR when the client address is unavailable.
  }

  const request = args.request;
  if (request) {
    const headerIp = [
      request.headers.get('cf-connecting-ip'),
      request.headers.get('x-forwarded-for'),
      request.headers.get('x-real-ip'),
    ]
      .map((value) => sanitizeIp(value))
      .find((value): value is string => Boolean(value));

    if (headerIp) return headerIp;
  }

  return sanitizeIp(args.fallback) ?? '127.0.0.1';
}

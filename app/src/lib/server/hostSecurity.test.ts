import { describe, expect, it } from 'vitest';
import { getAllowedHosts, isHostAllowed, readRequestHost } from './hostSecurity';

describe('hostSecurity', () => {
  it('parses allowed hosts from env', () => {
    expect(
      Array.from(
        getAllowedHosts({
          SECURITY_ALLOWED_HOSTS: 'app.cogotchi.dev, api.cogotchi.dev:443 , localhost:5173',
        }),
      ),
    ).toEqual(['app.cogotchi.dev', 'api.cogotchi.dev', 'localhost']);
  });

  it('allows all hosts when no allowlist is configured', () => {
    expect(isHostAllowed('anything.example', {})).toBe(true);
  });

  it('blocks hosts outside configured allowlist', () => {
    const envLike = { SECURITY_ALLOWED_HOSTS: 'app.cogotchi.dev,localhost:5173' };

    expect(isHostAllowed('app.cogotchi.dev', envLike)).toBe(true);
    expect(isHostAllowed('APP.COGOTCHI.DEV', envLike)).toBe(true);
    expect(isHostAllowed('evil.example', envLike)).toBe(false);
  });

  it('uses host header by default even when forwarded host is present', () => {
    const request = new Request('https://app.cogotchi.dev/api/profile', {
      headers: {
        host: 'app.cogotchi.dev',
        'x-forwarded-host': 'app.cogotchi.dev',
      },
    });

    expect(readRequestHost(request)).toBe('app.cogotchi.dev');
  });

  it('uses forwarded host only when proxy headers are explicitly trusted', () => {
    const request = new Request('https://app.cogotchi.dev/api/profile', {
      headers: {
        host: 'internal-proxy',
        'x-forwarded-host': 'app.cogotchi.dev',
      },
    });

    expect(readRequestHost(request, { SECURITY_TRUST_PROXY_HEADERS: 'true' })).toBe('app.cogotchi.dev');
    expect(readRequestHost(request, { SECURITY_TRUST_PROXY_HEADERS: 'false' })).toBe('internal-proxy');
  });
});

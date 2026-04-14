import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './+server';

vi.mock('$lib/server/authRepository', () => ({
  getAuthenticatedUser: vi.fn(),
}));
vi.mock('$lib/server/session', () => ({
  SESSION_COOKIE_NAME: 'wtd_session',
  parseSessionCookie: vi.fn(),
}));

import { getAuthenticatedUser } from '$lib/server/authRepository';
import { parseSessionCookie } from '$lib/server/session';

function mockCookies(cookieValue: string | undefined) {
  return {
    get: vi.fn().mockReturnValue(cookieValue),
    delete: vi.fn(),
  };
}

describe('/api/auth/session', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns unauthenticated when cookie is missing', async () => {
    const cookies = mockCookies(undefined);
    const res = await GET({ cookies } as any);
    const body = await res.json();
    expect(body.authenticated).toBe(false);
  });

  it('returns authenticated user when session is valid', async () => {
    const cookies = mockCookies('token:user');
    (parseSessionCookie as any).mockReturnValue({ token: 't', userId: 'u' });
    (getAuthenticatedUser as any).mockResolvedValue({
      id: 'u',
      email: 'u@test.dev',
      nickname: 'u',
      tier: 'free',
      phase: 'alpha',
      wallet_address: null,
    });
    const res = await GET({ cookies } as any);
    const body = await res.json();
    expect(body.authenticated).toBe(true);
    expect(body.user.email).toBe('u@test.dev');
  });
});


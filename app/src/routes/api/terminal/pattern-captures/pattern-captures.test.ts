import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/authGuard', () => ({
  getAuthUserFromCookies: vi.fn(),
}));
vi.mock('$lib/server/terminalPersistence', () => ({
  createPatternCapture: vi.fn(),
  listPatternCaptures: vi.fn(async () => []),
}));

import { GET, POST } from './+server';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { createPatternCapture, listPatternCaptures } from '$lib/server/terminalPersistence';

describe('/api/terminal/pattern-captures', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires authentication for GET', async () => {
    (getAuthUserFromCookies as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await GET({ cookies: {}, url: new URL('http://localhost/api/terminal/pattern-captures') } as any);
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid POST payload', async () => {
    (getAuthUserFromCookies as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'user-1' });
    const req = new Request('http://localhost/api/terminal/pattern-captures', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ symbol: '', timeframe: '4h', triggerOrigin: 'manual' }),
    });
    const res = await POST({ cookies: {}, request: req } as any);
    expect(res.status).toBe(400);
  });

  it('requires an explicit viewport for terminal save setup captures', async () => {
    (getAuthUserFromCookies as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'user-1' });
    const req = new Request('http://localhost/api/terminal/pattern-captures', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        symbol: 'BTCUSDT',
        timeframe: '4h',
        triggerOrigin: 'manual',
        sourceFreshness: { source: 'terminal_save_setup' },
        snapshot: {},
      }),
    });
    const res = await POST({ cookies: {}, request: req } as any);
    expect(res.status).toBe(400);
    expect(createPatternCapture).not.toHaveBeenCalled();
  });

  it('allows lookup by capture id on GET', async () => {
    (getAuthUserFromCookies as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'user-1' });
    const mockedList = listPatternCaptures as unknown as ReturnType<typeof vi.fn>;
    mockedList.mockResolvedValueOnce([]);

    const res = await GET({
      cookies: {},
      url: new URL('http://localhost/api/terminal/pattern-captures?id=cap-123&limit=1'),
    } as any);

    expect(res.status).toBe(200);
    expect(mockedList).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ id: 'cap-123', limit: 1 }),
    );
  });
});

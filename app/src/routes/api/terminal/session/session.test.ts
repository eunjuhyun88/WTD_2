import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/authGuard', () => ({
  getAuthUserFromCookies: vi.fn(),
}));
vi.mock('$lib/server/terminal/sessionService', () => ({
  loadTerminalSession: vi.fn(async () => ({
    ok: true,
    schemaVersion: 1,
    watchlist: [],
    pins: [],
    alerts: [],
    macro: [],
    latestExportJob: null,
    updatedAt: new Date().toISOString(),
  })),
}));

import { GET } from './+server';
import { getAuthUserFromCookies } from '$lib/server/authGuard';
import { loadTerminalSession } from '$lib/server/terminal/sessionService';

describe('/api/terminal/session', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires authentication', async () => {
    (getAuthUserFromCookies as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await GET({ cookies: {} } as any);
    expect(res.status).toBe(401);
  });

  it('loads the aggregated session', async () => {
    (getAuthUserFromCookies as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'user-1' });
    const res = await GET({ cookies: {} } as any);
    expect(res.status).toBe(200);
    expect(loadTerminalSession).toHaveBeenCalledWith('user-1');
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/authGuard', () => ({
  getAuthUserFromCookies: vi.fn(),
}));
vi.mock('$lib/server/terminalPersistence', () => ({
  createTerminalExportJob: vi.fn(),
  scheduleTerminalExportJob: vi.fn(),
}));

import { POST } from './+server';
import { getAuthUserFromCookies } from '$lib/server/authGuard';

describe('/api/terminal/exports', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires authentication for POST', async () => {
    (getAuthUserFromCookies as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const req = new Request('http://localhost/api/terminal/exports', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ exportType: 'terminal_report', symbol: 'BTCUSDT', timeframe: '4h' }),
    });
    const res = await POST({ cookies: {}, request: req } as any);
    expect(res.status).toBe(401);
  });
});

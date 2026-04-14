import { describe, it, expect, vi } from 'vitest';

vi.mock('$lib/server/providers', () => ({
  readRaw: vi.fn(async () => 42),
}));

import { GET } from './+server';

describe('/api/cogochi/thermometer', () => {
  it('returns expected payload shape', async () => {
    const res = await GET({} as any);
    const body = await res.json();
    expect(body).toHaveProperty('fearGreed');
    expect(body).toHaveProperty('btcDominance');
    expect(body).toHaveProperty('usdKrw');
  });
});


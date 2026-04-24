import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/supportedChains', () => ({
  searchSupportedChains: vi.fn(),
}));

import { searchSupportedChains } from '$lib/server/supportedChains';
import { GET } from './+server';

describe('/api/market/chains/search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a supported-chain search payload', async () => {
    vi.mocked(searchSupportedChains).mockResolvedValue({
      q: 'base',
      family: 'evm',
      total: 1,
      source: 'etherscan_chainlist',
      chains: [
        {
          family: 'evm',
          chainId: '8453',
          slug: 'base',
          label: 'Base',
          displayName: 'Base Mainnet',
          nativeSymbol: 'ETH',
          blockExplorerUrl: 'https://basescan.org/',
          apiUrl: 'https://api.etherscan.io/v2/api?chainid=8453',
          isTestnet: false,
          freeTierAvailable: false,
          paidTierAvailable: true,
          status: 1,
          comment: null,
          aliases: ['base', '8453'],
          source: 'etherscan_chainlist',
        },
      ],
    });

    const request = new Request('http://localhost/api/market/chains/search?q=base&family=evm');
    const res = await GET({ url: new URL(request.url) } as any);

    expect(res.status).toBe(200);
    expect(searchSupportedChains).toHaveBeenCalledWith({
      q: 'base',
      family: 'evm',
      includeTestnets: false,
      limit: 20,
    });

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.chains[0].slug).toBe('base');
  });

  it('rejects invalid family values', async () => {
    const request = new Request('http://localhost/api/market/chains/search?family=bad');
    const res = await GET({ url: new URL(request.url) } as any);

    expect(res.status).toBe(400);
  });
});

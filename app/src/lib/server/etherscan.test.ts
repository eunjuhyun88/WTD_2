import { beforeEach, describe, expect, it, vi } from 'vitest';

const { envState } = vi.hoisted(() => ({
  envState: {
    ETHERSCAN_API_KEY: 'etherscan_live_key_1234567890abcdef',
  },
}));

vi.mock('$env/dynamic/private', () => ({
  env: envState,
}));

vi.mock('$lib/server/providers/cache', () => ({
  getCached: vi.fn(),
  setCache: vi.fn(),
}));

import { getCached } from '$lib/server/providers/cache';
import {
  fetchAddressTokenBalance,
  fetchNativeBalance,
  fetchTokenHolderCount,
  fetchTokenInfo,
  fetchTopTokenHolders,
  hasEtherscanApiKey,
} from './etherscan';

describe('etherscan v2 provider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCached).mockReturnValue(null);
    vi.stubGlobal('fetch', vi.fn());
  });

  it('includes chainid for multichain native balance requests', async () => {
    vi.mocked(fetch as any).mockResolvedValueOnce(new Response(JSON.stringify({
      status: '1',
      message: 'OK',
      result: '172774397764084972158218',
    })));

    const balance = await fetchNativeBalance('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', { chainId: '8453' });

    expect(hasEtherscanApiKey()).toBe(true);
    expect(balance).toBe('172774397764084972158218');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(fetch as any).mock.calls[0]?.[0])).toContain('chainid=8453');
  });

  it('normalizes account token holdings', async () => {
    vi.mocked(fetch as any).mockResolvedValueOnce(new Response(JSON.stringify({
      status: '1',
      message: 'OK',
      result: [
        {
          TokenAddress: '0xToken',
          TokenName: 'USD Coin',
          TokenSymbol: 'USDC',
          TokenQuantity: '1500000',
          TokenDivisor: '6',
          TokenPriceUSD: '0.9998',
        },
      ],
    })));

    const holdings = await fetchAddressTokenBalance('0xAccount', '1', '20', { chainId: '42161' });

    expect(holdings?.[0]?.TokenSymbol).toBe('USDC');
    expect(String(vi.mocked(fetch as any).mock.calls[0]?.[0])).toContain('chainid=42161');
  });

  it('loads token holder count, token info, and top holders', async () => {
    vi.mocked(fetch as any)
      .mockResolvedValueOnce(new Response(JSON.stringify({
        status: '1',
        message: 'OK',
        result: '30506',
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        status: '1',
        message: 'OK',
        result: [
          {
            contractAddress: '0xToken',
            tokenName: 'Mock Token',
            symbol: 'MOCK',
            divisor: '18',
            totalSupply: '100000000000000000000',
            blueCheckmark: 'true',
            description: 'Mock token',
            website: 'https://example.com',
            tokenPriceUSD: '1.5',
          },
        ],
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        status: '1',
        message: 'Ok',
        result: [
          {
            TokenHolderAddress: '0xHolder1',
            TokenHolderQuantity: '1000000000000000000',
          },
        ],
      })));

    const holderCount = await fetchTokenHolderCount('0xToken', { chainId: '1' });
    const meta = await fetchTokenInfo('0xToken', { chainId: '1' });
    const topHolders = await fetchTopTokenHolders('0xToken', '20', { chainId: '1' });

    expect(holderCount).toBe(30506);
    expect(meta?.[0]?.symbol).toBe('MOCK');
    expect(topHolders?.[0]?.TokenHolderAddress).toBe('0xHolder1');
  });
});

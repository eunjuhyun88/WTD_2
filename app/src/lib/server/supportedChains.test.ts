import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invalidatePrefix } from './providers/cache';
import { resolveSupportedEvmChain, searchSupportedChains } from './supportedChains';

describe('supportedChains registry', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    invalidatePrefix('etherscan:chainlist:v2');
    vi.unstubAllGlobals();
  });

  it('uses the live Etherscan chainlist for evm search', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            result: [
              {
                chainname: 'Base Mainnet',
                chainid: '8453',
                blockexplorer: 'https://basescan.org/',
                apiurl: 'https://api.etherscan.io/v2/api?chainid=8453',
                status: 1,
                comment: '',
              },
              {
                chainname: 'Base Sepolia Testnet',
                chainid: '84532',
                blockexplorer: 'https://sepolia.basescan.org/',
                apiurl: 'https://api.etherscan.io/v2/api?chainid=84532',
                status: 1,
                comment: '',
              },
            ],
          }),
          { status: 200 },
        ),
      ),
    );

    const result = await searchSupportedChains({
      q: 'base',
      family: 'evm',
      includeTestnets: true,
      limit: 5,
    });

    expect(result.source).toBe('etherscan_chainlist');
    expect(result.chains[0]?.slug).toBe('base');
    expect(result.chains[0]?.chainId).toBe('8453');
    expect(result.chains[1]?.slug).toBe('base-sepolia');
  });

  it('falls back to the embedded snapshot when chainlist fetch fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('offline');
    }));

    const resolved = await resolveSupportedEvmChain('world');
    const sepolia = await resolveSupportedEvmChain('ethereum-sepolia');

    expect(resolved?.slug).toBe('world');
    expect(resolved?.chainId).toBe('480');
    expect(sepolia?.chainId).toBe('11155111');
  });

  it('includes manual non-evm chains in the public search surface', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('offline');
    }));

    const result = await searchSupportedChains({
      q: 'sol',
      family: 'all',
      limit: 10,
    });

    expect(result.source).toBe('composite');
    expect(result.chains[0]?.family).toBe('solana');
    expect(result.chains[0]?.slug).toBe('solana');
  });
});

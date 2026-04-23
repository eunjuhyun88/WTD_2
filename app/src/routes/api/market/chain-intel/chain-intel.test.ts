import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/chainIntel', () => ({
  fetchChainIntel: vi.fn(),
}));

import { fetchChainIntel } from '$lib/server/chainIntel';
import { GET } from './+server';

describe('/api/market/chain-intel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a canonical Solana token payload', async () => {
    vi.mocked(fetchChainIntel).mockResolvedValue({
      family: 'solana',
      chain: 'solana',
      chainId: null,
      chainLabel: 'Solana',
      entity: 'token',
      address: 'So11111111111111111111111111111111111111112',
      addressSource: 'default',
      at: Date.now(),
      summary: {
        title: 'SOL Solana token intel',
        subtitle: 'Default reference token loaded from Solscan.',
        keySignals: [],
        nextChecks: [],
      },
      providers: {
        meta: { provider: 'solscan', status: 'live' },
        holders: { provider: 'solscan', status: 'live' },
        markets: { provider: 'solscan', status: 'live' },
        activity: { provider: 'solscan', status: 'partial' },
      },
      asset: {
        name: 'Wrapped SOL',
        symbol: 'SOL',
        iconUrl: null,
        decimals: 9,
        priceUsd: 150,
        priceChange24hPct: 2,
        marketCapUsd: 80_000_000_000,
        volume24hUsd: 500_000_000,
        dexVolume24hUsd: 250_000_000,
        supply: 1000,
        holderCount: 2,
        creator: null,
        createdTimeMs: null,
        mintAuthority: null,
        freezeAuthority: null,
      },
      topHolders: [],
      markets: [],
      recentActivity: [],
    } as any);

    const request = new Request('http://localhost/api/market/chain-intel?chain=solana&entity=token');
    const res = await GET({
      url: new URL(request.url),
      request,
      getClientAddress: () => '127.0.0.1',
    } as any);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(fetchChainIntel).toHaveBeenCalledWith({
      chain: 'solana',
      entity: 'token',
      address: null,
      chainId: null,
    });
    expect(body.chain).toBe('solana');
    expect(body.summary.title).toContain('SOL');
  });

  it('forwards tron token requests to the canonical loader', async () => {
    vi.mocked(fetchChainIntel).mockResolvedValue({
      family: 'tron',
      chain: 'tron',
      chainId: null,
      chainLabel: 'TRON',
      entity: 'token',
      address: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
      addressSource: 'default',
      at: Date.now(),
      summary: {
        title: 'USDT TRON token intel',
        subtitle: 'Default TRON reference token loaded from TRONSCAN.',
        keySignals: [],
        nextChecks: [],
      },
      providers: {
        meta: { provider: 'tronscan', status: 'live' },
        holders: { provider: 'tronscan', status: 'live' },
        transfers: { provider: 'tronscan', status: 'partial' },
        supply: { provider: 'tronscan', status: 'live' },
      },
      asset: {
        name: 'Tether USD',
        symbol: 'USDT',
        iconUrl: null,
        decimals: 6,
        priceUsd: 1,
        liquidity24hUsd: 1000,
        holderCount: 100,
        totalSupply: 1000000,
        issuer: null,
        homePage: null,
        description: null,
      },
      topHolders: [],
      recentActivity: [],
    } as any);

    const request = new Request('http://localhost/api/market/chain-intel?chain=tron&entity=token');
    const res = await GET({
      url: new URL(request.url),
      request,
      getClientAddress: () => '127.0.0.1',
    } as any);

    expect(res.status).toBe(200);
    expect(fetchChainIntel).toHaveBeenCalledWith({
      chain: 'tron',
      entity: 'token',
      address: null,
      chainId: null,
    });
  });

  it('passes chainid for evm requests', async () => {
    vi.mocked(fetchChainIntel).mockResolvedValue({
      family: 'evm',
      chain: 'base',
      chainId: '8453',
      chainLabel: 'Base',
      entity: 'account',
      address: '0x4200000000000000000000000000000000000006',
      addressSource: 'user',
      at: Date.now(),
      summary: {
        title: 'Base account intel',
        subtitle: 'User-selected Base account loaded from Etherscan V2.',
        keySignals: [],
        nextChecks: [],
      },
      providers: {
        balance: { provider: 'etherscan', status: 'live' },
        transactions: { provider: 'etherscan', status: 'live' },
        holdings: { provider: 'etherscan', status: 'partial' },
        labels: { provider: 'etherscan', status: 'blocked' },
      },
      account: {
        nativeSymbol: 'ETH',
        balanceRaw: '1',
        balanceNative: 1,
        portfolioUsd: null,
        label: null,
      },
      labels: [],
      tokenHoldings: [],
      recentTransactions: [],
    } as any);

    const request = new Request('http://localhost/api/market/chain-intel?chain=base&entity=account&chainid=8453&address=0x4200000000000000000000000000000000000006');
    const res = await GET({
      url: new URL(request.url),
      request,
      getClientAddress: () => '127.0.0.1',
    } as any);

    expect(res.status).toBe(200);
    expect(fetchChainIntel).toHaveBeenCalledWith({
      chain: 'base',
      entity: 'account',
      address: '0x4200000000000000000000000000000000000006',
      chainId: '8453',
    });
  });
});

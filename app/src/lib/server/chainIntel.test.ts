import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/solscan', () => ({
  hasSolscanKey: vi.fn(() => true),
  fetchSolscanTokenIntel: vi.fn(),
  fetchSolscanAccountIntel: vi.fn(),
}));

vi.mock('$lib/server/tronscan', () => ({
  hasTronscanKey: vi.fn(() => true),
  fetchTronscanTokenIntel: vi.fn(),
  fetchTronscanAccountIntel: vi.fn(),
}));

vi.mock('$lib/server/coingeckoOnchain', () => ({
  hasCoinGeckoApiKey: vi.fn(() => false),
  fetchCoinGeckoOnchainTokenIntel: vi.fn(),
}));

vi.mock('$lib/server/supportedChains', () => ({
  resolveSupportedEvmChain: vi.fn(),
}));

vi.mock('$lib/server/etherscan', () => ({
  hasEtherscanApiKey: vi.fn(() => true),
  fetchNativeBalance: vi.fn(),
  fetchNormalTxList: vi.fn(),
  fetchAddressTokenBalance: vi.fn(),
  fetchAddressTag: vi.fn(),
  fetchTokenInfo: vi.fn(),
  fetchTokenHolderCount: vi.fn(),
  fetchTopTokenHolders: vi.fn(),
  fetchTokenSupply: vi.fn(),
}));

import {
  fetchAddressTag,
  fetchAddressTokenBalance,
  fetchNativeBalance,
  fetchNormalTxList,
  fetchTokenHolderCount,
  fetchTokenInfo,
  fetchTokenSupply,
  fetchTopTokenHolders,
} from '$lib/server/etherscan';
import {
  fetchCoinGeckoOnchainTokenIntel,
  hasCoinGeckoApiKey,
} from '$lib/server/coingeckoOnchain';
import { fetchTronscanTokenIntel } from '$lib/server/tronscan';
import { resolveSupportedEvmChain } from '$lib/server/supportedChains';
import { fetchChainIntel } from './chainIntel';

describe('chainIntel aggregator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(hasCoinGeckoApiKey).mockReturnValue(false);
    vi.mocked(resolveSupportedEvmChain).mockImplementation(async (chain, chainId) => {
      if (chainId === '8453' || chain === 'base') {
        return {
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
        };
      }
      if (chainId === '1' || chain === 'ethereum') {
        return {
          family: 'evm',
          chainId: '1',
          slug: 'ethereum',
          label: 'Ethereum',
          displayName: 'Ethereum Mainnet',
          nativeSymbol: 'ETH',
          blockExplorerUrl: 'https://etherscan.io/',
          apiUrl: 'https://api.etherscan.io/v2/api?chainid=1',
          isTestnet: false,
          freeTierAvailable: true,
          paidTierAvailable: true,
          status: 1,
          comment: null,
          aliases: ['ethereum', 'eth', '1'],
          source: 'etherscan_chainlist',
        };
      }
      if (chainId === '480' || chain === 'world') {
        return {
          family: 'evm',
          chainId: '480',
          slug: 'world',
          label: 'World',
          displayName: 'World Mainnet',
          nativeSymbol: 'ETH',
          blockExplorerUrl: 'https://worldscan.org/',
          apiUrl: 'https://api.etherscan.io/v2/api?chainid=480',
          isTestnet: false,
          freeTierAvailable: true,
          paidTierAvailable: true,
          status: 1,
          comment: null,
          aliases: ['world', 'worldchain', '480'],
          source: 'etherscan_chainlist',
        };
      }
      return null;
    });
  });

  it('builds an evm account payload using chain alias + chainid', async () => {
    vi.mocked(fetchNativeBalance).mockResolvedValue('1000000000000000000');
    vi.mocked(fetchNormalTxList).mockResolvedValue([
      {
        hash: '0xTx1',
        timeStamp: '1710000000',
        from: '0xabc',
        to: '0xdef',
        value: '1000000000000000000',
        blockNumber: '1',
        nonce: '1',
        blockHash: '0xBlock',
        transactionIndex: '0',
        gas: '21000',
        gasPrice: '1',
        isError: '0',
        input: '0x',
      },
    ] as any);
    vi.mocked(fetchAddressTokenBalance).mockResolvedValue([
      {
        TokenAddress: '0xToken',
        TokenName: 'USD Coin',
        TokenSymbol: 'USDC',
        TokenQuantity: '2000000',
        TokenDivisor: '6',
        TokenPriceUSD: '1',
      },
    ]);
    vi.mocked(fetchAddressTag).mockResolvedValue(null);

    const payload = await fetchChainIntel({
      chain: 'base',
      chainId: '8453',
      entity: 'account',
      address: '0xabc',
    });

    const accountPayload = payload as any;
    expect(accountPayload.family).toBe('evm');
    expect(accountPayload.chain).toBe('base');
    expect(accountPayload.chainId).toBe('8453');
    expect(accountPayload.entity).toBe('account');
    expect(accountPayload.providers.balance.status).toBe('live');
    expect(accountPayload.account.balanceNative).toBe(1);
    expect(accountPayload.tokenHoldings[0]?.symbol).toBe('USDC');
    expect(accountPayload.providers.labels.status).toBe('blocked');
  });

  it('builds a tron token payload from TRONSCAN', async () => {
    vi.mocked(fetchTronscanTokenIntel).mockResolvedValue({
      address: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
      name: 'Tether USD',
      symbol: 'USDT',
      iconUrl: 'https://static.tronscan.org/usdt.png',
      decimals: 6,
      priceUsd: 1,
      liquidity24hUsd: 10_000_000,
      holderCount: 1000,
      totalSupply: 1_000_000,
      issuer: 'TIssuer',
      homePage: 'https://tron.network/usdt',
      description: 'TRON USDT',
      topHolders: [{ address: 'THolder1', sharePct: 12.5 }],
      recentActivity: [{ id: 'Tx1', timestampMs: 1710000000000, amount: 1, symbol: 'USDT' }],
    });

    const payload = await fetchChainIntel({
      chain: 'tron',
      entity: 'token',
      address: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
    });

    expect(payload.family).toBe('tron');
    expect(payload.entity).toBe('token');
    expect(payload.summary.title).toContain('USDT');
    expect((payload as any).providers.transfers.status).toBe('live');
    expect((payload as any).asset.holderCount).toBe(1000);
  });

  it('rejects unsupported chains', async () => {
    await expect(fetchChainIntel({
      chain: 'dogecoin',
      entity: 'account',
      address: 'D12345678901234567890',
    })).rejects.toThrow('unsupported_chain');
  });

  it('builds an evm token payload using partial paid-lane coverage', async () => {
    vi.mocked(fetchTokenInfo).mockResolvedValue(null);
    vi.mocked(fetchTokenHolderCount).mockResolvedValue(42);
    vi.mocked(fetchTopTokenHolders).mockResolvedValue(null);
    vi.mocked(fetchTokenSupply).mockResolvedValue('1000000000000000000000');

    const payload = await fetchChainIntel({
      chain: 'ethereum',
      entity: 'token',
      address: '0xToken',
    });

    expect(payload.family).toBe('evm');
    expect(payload.chain).toBe('ethereum');
    expect((payload as any).asset.holderCount).toBe(42);
    expect((payload as any).providers.meta.status).toBe('blocked');
    expect((payload as any).providers.supply.status).toBe('live');
  });

  it('merges CoinGecko onchain dex coverage into an evm token payload', async () => {
    vi.mocked(hasCoinGeckoApiKey).mockReturnValue(true);
    vi.mocked(fetchTokenInfo).mockResolvedValue(null);
    vi.mocked(fetchTokenHolderCount).mockResolvedValue(42);
    vi.mocked(fetchTopTokenHolders).mockResolvedValue([]);
    vi.mocked(fetchTokenSupply).mockResolvedValue(null);
    vi.mocked(fetchCoinGeckoOnchainTokenIntel).mockResolvedValue({
      networkId: 'base',
      networkLabel: 'Base',
      assetPlatformId: 'base',
      name: 'Mock Token',
      symbol: 'MOCK',
      iconUrl: 'https://example.com/mock.png',
      decimals: 18,
      priceUsd: 1.23,
      priceChange24hPct: 4.5,
      marketCapUsd: 123_000_000,
      fdvUsd: 456_000_000,
      liquidityUsd: 9_500_000,
      dexVolume24hUsd: 27_000_000,
      markets: [
        {
          venue: 'Uniswap',
          pair: 'MOCK/WETH',
          volume24hUsd: 27_000_000,
          tvlUsd: 9_500_000,
          tradeCount24h: 1200,
          priceUsd: 1.23,
        },
      ],
      recentActivity: [
        {
          id: '0xtrade1',
          timestampMs: 1710000000000,
          direction: 'in',
          from: '0xfrom',
          to: 'Uniswap MOCK/WETH',
          amount: 1000,
          symbol: 'MOCK',
          note: 'buy · uniswap',
        },
      ],
      tokenLoaded: true,
      poolsLoaded: true,
      tradesLoaded: true,
    });

    const payload = await fetchChainIntel({
      chain: 'base',
      chainId: '8453',
      entity: 'token',
      address: '0xToken',
    });

    expect(payload.family).toBe('evm');
    expect((payload as any).asset.symbol).toBe('MOCK');
    expect((payload as any).providers.meta.status).toBe('partial');
    expect((payload as any).providers.dex.status).toBe('live');
    expect((payload as any).providers.dexTrades.status).toBe('live');
    expect((payload as any).markets).toHaveLength(1);
    expect((payload as any).recentActivity).toHaveLength(1);
    expect((payload as any).asset.dexNetworkId).toBe('base');
  });

  it('resolves an official registry chain that was not in the old hardcoded alias map', async () => {
    vi.mocked(fetchNativeBalance).mockResolvedValue('0');
    vi.mocked(fetchNormalTxList).mockResolvedValue([]);
    vi.mocked(fetchAddressTokenBalance).mockResolvedValue([]);
    vi.mocked(fetchAddressTag).mockResolvedValue(null);

    const payload = await fetchChainIntel({
      chain: 'world',
      entity: 'account',
      address: '0xabc',
    });

    expect(payload.family).toBe('evm');
    expect(payload.chain).toBe('world');
    expect(payload.chainId).toBe('480');
    expect((payload as any).chainLabel).toBe('World');
  });
});

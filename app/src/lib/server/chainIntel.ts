import type {
  ChainIntelActivity,
  ChainIntelAddressSource,
  ChainIntelFamily,
  ChainIntelHolder,
  ChainIntelLabel,
  ChainIntelPayload,
  ChainIntelProviderState,
  ChainIntelSignal,
  ChainIntelTokenHolding,
  EvmAccountIntelPayload,
  EvmTokenIntelPayload,
  SolanaAccountIntelPayload,
  SolanaTokenIntelPayload,
  TronAccountIntelPayload,
  TronTokenIntelPayload,
} from '$lib/contracts/chainIntel';
import {
  fetchAddressTag,
  fetchAddressTokenBalance,
  fetchNativeBalance,
  fetchNormalTxList,
  fetchTokenHolderCount,
  fetchTokenInfo,
  fetchTokenSupply,
  fetchTopTokenHolders,
  hasEtherscanApiKey,
} from '$lib/server/etherscan';
import {
  fetchSolscanAccountIntel,
  fetchSolscanTokenIntel,
  hasSolscanKey,
} from '$lib/server/solscan';
import {
  fetchCoinGeckoOnchainTokenIntel,
  hasCoinGeckoApiKey,
} from '$lib/server/coingeckoOnchain';
import {
  fetchTronscanAccountIntel,
  fetchTronscanTokenIntel,
  hasTronscanKey,
} from '$lib/server/tronscan';
import { resolveSupportedEvmChain } from '$lib/server/supportedChains';

export const DEFAULT_SOLANA_TOKEN_ADDRESS = 'So11111111111111111111111111111111111111112';
export const DEFAULT_TRON_ACCOUNT_ADDRESS = 'TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7';
export const DEFAULT_TRON_TOKEN_ADDRESS = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
export const DEFAULT_EVM_ACCOUNT_ADDRESS = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
export const DEFAULT_EVM_TOKEN_ADDRESS = '0xdAC17F958D2ee523a2206206994597C13D831ec7';

interface FetchChainIntelArgs {
  chain: string;
  entity: 'token' | 'account';
  address?: string | null;
  chainId?: string | null;
}

interface ResolvedChainTarget {
  family: ChainIntelFamily;
  chain: string;
  chainId: string | null;
  chainLabel: string;
  nativeSymbol: string | null;
  aliases?: string[];
  defaultAccount?: string;
  defaultToken?: string;
}

const EVM_DEFAULTS: Record<string, Pick<ResolvedChainTarget, 'defaultAccount' | 'defaultToken'>> = {
  '1': {
    defaultAccount: DEFAULT_EVM_ACCOUNT_ADDRESS,
    defaultToken: DEFAULT_EVM_TOKEN_ADDRESS,
  },
};

function providerState(
  provider: string,
  status: ChainIntelProviderState['status'],
  detail: string,
): ChainIntelProviderState {
  return {
    provider,
    status,
    detail,
    updatedAt: Date.now(),
  };
}

function signal(id: string, label: string, value: number | string | null, unit?: string, note?: string): ChainIntelSignal {
  return { id, label, value, unit, note };
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    if (value === 'true' || value === '1') return true;
    if (value === 'false' || value === '0') return false;
  }
  return null;
}

function toStringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function scaleAmount(value: unknown, decimals = 18): number | null {
  const raw = toNumber(value);
  if (raw == null) return null;
  return raw / 10 ** decimals;
}

function sumTopHolderShare(topHolders: Array<{ sharePct?: number | null }>, limit = 10): number | null {
  const total = topHolders
    .slice(0, limit)
    .map((holder) => holder.sharePct ?? null)
    .filter((value): value is number => value != null && Number.isFinite(value))
    .reduce((acc, value) => acc + value, 0);
  return total > 0 ? Number(total.toFixed(2)) : null;
}

function sumPortfolioUsd(holdings: ChainIntelTokenHolding[]): number | null {
  const total = holdings
    .map((holding) => holding.valueUsd ?? null)
    .filter((value): value is number => value != null && Number.isFinite(value))
    .reduce((acc, value) => acc + value, 0);
  return total > 0 ? Number(total.toFixed(2)) : null;
}

async function resolveChainTarget(chain: string, chainId?: string | null): Promise<ResolvedChainTarget> {
  const normalizedChain = chain.trim().toLowerCase();
  if (normalizedChain === 'solana') {
    return {
      family: 'solana',
      chain: 'solana',
      chainId: null,
      chainLabel: 'Solana',
      nativeSymbol: 'SOL',
    };
  }
  if (normalizedChain === 'tron') {
    return {
      family: 'tron',
      chain: 'tron',
      chainId: null,
      chainLabel: 'TRON',
      nativeSymbol: 'TRX',
      defaultAccount: DEFAULT_TRON_ACCOUNT_ADDRESS,
      defaultToken: DEFAULT_TRON_TOKEN_ADDRESS,
    };
  }

  const resolved = await resolveSupportedEvmChain(normalizedChain, chainId);
  if (resolved) {
    const defaults = resolved.chainId ? EVM_DEFAULTS[resolved.chainId] : undefined;
    return {
      family: 'evm',
      chain: resolved.slug,
      chainId: resolved.chainId,
      chainLabel: resolved.label,
      nativeSymbol: resolved.nativeSymbol ?? 'NATIVE',
      aliases: resolved.aliases,
      defaultAccount: defaults?.defaultAccount,
      defaultToken: defaults?.defaultToken,
    };
  }

  throw new Error('unsupported_chain');
}

function resolveAddress(
  args: FetchChainIntelArgs,
  target: ResolvedChainTarget,
): { address: string; addressSource: ChainIntelAddressSource } {
  const trimmed = args.address?.trim();
  if (trimmed) {
    return { address: trimmed, addressSource: 'user' };
  }
  if (target.family === 'solana' && args.entity === 'token') {
    return { address: DEFAULT_SOLANA_TOKEN_ADDRESS, addressSource: 'default' };
  }
  if (args.entity === 'account' && target.defaultAccount) {
    return { address: target.defaultAccount, addressSource: 'default' };
  }
  if (args.entity === 'token' && target.defaultToken) {
    return { address: target.defaultToken, addressSource: 'default' };
  }
  throw new Error('address_required');
}

function buildSolanaTokenBlockedPayload(
  address: string,
  addressSource: ChainIntelAddressSource,
  detail: string,
): SolanaTokenIntelPayload {
  return {
    family: 'solana',
    chain: 'solana',
    chainId: null,
    chainLabel: 'Solana',
    entity: 'token',
    address,
    addressSource,
    at: Date.now(),
    summary: {
      title: 'Solana token intel unavailable',
      subtitle: detail,
      keySignals: [signal('provider_state', 'Provider state', 'blocked')],
      nextChecks: [
        'Set SOLSCAN_API_KEY in app/.env.local.',
        'Retry the route with a token mint address.',
        'Validate holder concentration against DEX market depth.',
      ],
    },
    providers: {
      meta: providerState('solscan', 'blocked', detail),
      holders: providerState('solscan', 'blocked', detail),
      markets: providerState('solscan', 'blocked', detail),
      activity: providerState('solscan', 'blocked', detail),
    },
    asset: {
      name: null,
      symbol: null,
      iconUrl: null,
      decimals: null,
      priceUsd: null,
      priceChange24hPct: null,
      marketCapUsd: null,
      volume24hUsd: null,
      dexVolume24hUsd: null,
      supply: null,
      holderCount: null,
      creator: null,
      createdTimeMs: null,
      mintAuthority: null,
      freezeAuthority: null,
    },
    topHolders: [],
    markets: [],
    recentActivity: [],
  };
}

function buildSolanaAccountBlockedPayload(
  address: string,
  addressSource: ChainIntelAddressSource,
  detail: string,
): SolanaAccountIntelPayload {
  return {
    family: 'solana',
    chain: 'solana',
    chainId: null,
    chainLabel: 'Solana',
    entity: 'account',
    address,
    addressSource,
    at: Date.now(),
    summary: {
      title: 'Solana account intel unavailable',
      subtitle: detail,
      keySignals: [signal('provider_state', 'Provider state', 'blocked')],
      nextChecks: [
        'Set SOLSCAN_API_KEY in app/.env.local.',
        'Retry the route with a Solana wallet address.',
        'Add account transfer coverage only after account/detail stabilizes.',
      ],
    },
    providers: {
      account: providerState('solscan', 'blocked', detail),
    },
    account: {
      lamports: null,
      solBalance: null,
      type: null,
      executable: null,
      ownerProgram: null,
      rentEpoch: null,
      isOnCurve: null,
    },
  };
}

function buildTronTokenBlockedPayload(
  address: string,
  addressSource: ChainIntelAddressSource,
  detail: string,
): TronTokenIntelPayload {
  return {
    family: 'tron',
    chain: 'tron',
    chainId: null,
    chainLabel: 'TRON',
    entity: 'token',
    address,
    addressSource,
    at: Date.now(),
    summary: {
      title: 'TRON token intel unavailable',
      subtitle: detail,
      keySignals: [signal('provider_state', 'Provider state', 'blocked')],
      nextChecks: [
        'Set TRONSCAN_API_KEY in app/.env.local. Legacy TRONGRID_API_KEY still works as local fallback.',
        'Retry the route with a TRC20 contract address.',
        'Compare holder concentration against transfer velocity before trusting the token.',
      ],
    },
    providers: {
      meta: providerState('tronscan', 'blocked', detail),
      holders: providerState('tronscan', 'blocked', detail),
      transfers: providerState('tronscan', 'blocked', detail),
      supply: providerState('tronscan', 'blocked', detail),
    },
    asset: {
      name: null,
      symbol: null,
      iconUrl: null,
      decimals: null,
      priceUsd: null,
      liquidity24hUsd: null,
      holderCount: null,
      totalSupply: null,
      issuer: null,
      homePage: null,
      description: null,
    },
    topHolders: [],
    recentActivity: [],
  };
}

function buildTronAccountBlockedPayload(
  address: string,
  addressSource: ChainIntelAddressSource,
  detail: string,
): TronAccountIntelPayload {
  return {
    family: 'tron',
    chain: 'tron',
    chainId: null,
    chainLabel: 'TRON',
    entity: 'account',
    address,
    addressSource,
    at: Date.now(),
    summary: {
      title: 'TRON account intel unavailable',
      subtitle: detail,
      keySignals: [signal('provider_state', 'Provider state', 'blocked')],
      nextChecks: [
        'Set TRONSCAN_API_KEY in app/.env.local. Legacy TRONGRID_API_KEY still works as local fallback.',
        'Retry the route with a TRON wallet address.',
        'Compare recent TRC20 flow with native TRX balance movement.',
      ],
    },
    providers: {
      account: providerState('tronscan', 'blocked', detail),
      transactions: providerState('tronscan', 'blocked', detail),
      trc20: providerState('tronscan', 'blocked', detail),
    },
    account: {
      balanceSun: null,
      balanceTrx: null,
      createTimeMs: null,
      latestOperationTimeMs: null,
      freeNetUsed: null,
      energyUsed: null,
      trc20TokenCount: null,
    },
    recentTransactions: [],
    recentTrc20Transfers: [],
  };
}

function buildEvmAccountBlockedPayload(
  target: ResolvedChainTarget,
  address: string,
  addressSource: ChainIntelAddressSource,
  detail: string,
): EvmAccountIntelPayload {
  return {
    family: 'evm',
    chain: target.chain,
    chainId: target.chainId,
    chainLabel: target.chainLabel,
    entity: 'account',
    address,
    addressSource,
    at: Date.now(),
    summary: {
      title: `${target.chainLabel} account intel unavailable`,
      subtitle: detail,
      keySignals: [signal('provider_state', 'Provider state', 'blocked')],
      nextChecks: [
        'Set ETHERSCAN_API_KEY in app/.env.local.',
        'Retry with a valid EVM wallet or contract address.',
        'Specify chainid when querying a non-Ethereum EVM chain.',
      ],
    },
    providers: {
      balance: providerState('etherscan', 'blocked', detail),
      transactions: providerState('etherscan', 'blocked', detail),
      holdings: providerState('etherscan', 'blocked', detail),
      labels: providerState('etherscan', 'blocked', detail),
    },
    account: {
      nativeSymbol: target.nativeSymbol ?? 'NATIVE',
      balanceRaw: null,
      balanceNative: null,
      portfolioUsd: null,
      label: null,
    },
    labels: [],
    tokenHoldings: [],
    recentTransactions: [],
  };
}

function buildEvmTokenBlockedPayload(
  target: ResolvedChainTarget,
  address: string,
  addressSource: ChainIntelAddressSource,
  detail: string,
): EvmTokenIntelPayload {
  return {
    family: 'evm',
    chain: target.chain,
    chainId: target.chainId,
    chainLabel: target.chainLabel,
    entity: 'token',
    address,
    addressSource,
    at: Date.now(),
    summary: {
      title: `${target.chainLabel} token intel unavailable`,
      subtitle: detail,
      keySignals: [signal('provider_state', 'Provider state', 'blocked')],
      nextChecks: [
        'Set ETHERSCAN_API_KEY and/or COINGECKO_API_KEY in app/.env.local.',
        'Retry with an ERC20 contract address.',
        'Specify chainid when querying a non-Ethereum EVM chain.',
      ],
    },
    providers: {
      meta: providerState('etherscan', 'blocked', detail),
      holderCount: providerState('etherscan', 'blocked', detail),
      topHolders: providerState('etherscan', 'blocked', detail),
      supply: providerState('etherscan', 'blocked', detail),
      dex: providerState('coingecko', 'blocked', detail),
      dexTrades: providerState('coingecko', 'blocked', detail),
    },
    asset: {
      name: null,
      symbol: null,
      iconUrl: null,
      decimals: null,
      priceUsd: null,
      priceChange24hPct: null,
      marketCapUsd: null,
      fdvUsd: null,
      liquidityUsd: null,
      dexVolume24hUsd: null,
      dexNetworkId: null,
      totalSupply: null,
      holderCount: null,
      website: null,
      description: null,
      blueCheckmark: null,
    },
    topHolders: [],
    markets: [],
    recentActivity: [],
  };
}

function mapEvmHolding(item: {
  TokenAddress: string;
  TokenName: string;
  TokenSymbol: string;
  TokenQuantity: string;
  TokenDivisor: string;
  TokenPriceUSD: string;
}): ChainIntelTokenHolding {
  const decimals = toNumber(item.TokenDivisor);
  const quantity = decimals == null ? item.TokenQuantity : scaleAmount(item.TokenQuantity, decimals);
  const priceUsd = toNumber(item.TokenPriceUSD);
  const valueUsd = typeof quantity === 'number' && priceUsd != null ? quantity * priceUsd : null;

  return {
    tokenAddress: item.TokenAddress,
    name: toStringValue(item.TokenName),
    symbol: toStringValue(item.TokenSymbol),
    quantity,
    decimals,
    priceUsd,
    valueUsd,
  };
}

function mapEvmLabels(rows: Array<{
  nametag?: string;
  url?: string;
  labels?: string[];
  labels_slug?: string[];
  reputation?: number | string;
}>): ChainIntelLabel[] {
  const labels: ChainIntelLabel[] = [];
  for (const row of rows) {
    const nametag = toStringValue(row.nametag);
    if (nametag) {
      labels.push({
        label: nametag,
        url: toStringValue(row.url),
        reputation: toNumber(row.reputation),
      });
    }
    (row.labels ?? []).forEach((label, index) => {
      if (!label) return;
      labels.push({
        label,
        slug: row.labels_slug?.[index] ?? null,
        reputation: toNumber(row.reputation),
      });
    });
  }

  const seen = new Set<string>();
  return labels.filter((label) => {
    const key = `${label.label}:${label.slug ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mapEvmTransaction(
  item: {
    hash: string;
    timeStamp: string;
    from: string;
    to: string;
    value: string;
    functionName?: string;
    methodId?: string;
  },
  address: string,
  nativeSymbol: string,
): ChainIntelActivity {
  const normalizedAddress = address.toLowerCase();
  const normalizedFrom = item.from.toLowerCase();
  const normalizedTo = item.to.toLowerCase();

  return {
    id: item.hash,
    timestampMs: toNumber(item.timeStamp) != null ? Number(item.timeStamp) * 1000 : null,
    direction:
      normalizedFrom === normalizedAddress && normalizedTo === normalizedAddress
        ? 'internal'
        : normalizedFrom === normalizedAddress
          ? 'out'
          : normalizedTo === normalizedAddress
            ? 'in'
            : 'unknown',
    from: item.from,
    to: item.to,
    amount: scaleAmount(item.value, 18),
    symbol: nativeSymbol,
    note: toStringValue(item.functionName) ?? toStringValue(item.methodId),
  };
}

function mapEvmTopHolder(
  item: { TokenHolderAddress: string; TokenHolderQuantity: string },
  decimals: number | null,
  totalSupply: number | null,
): ChainIntelHolder {
  const amount = decimals == null ? item.TokenHolderQuantity : scaleAmount(item.TokenHolderQuantity, decimals);
  const numericAmount = typeof amount === 'number' ? amount : toNumber(amount);
  const sharePct = numericAmount != null && totalSupply != null && totalSupply > 0
    ? (numericAmount / totalSupply) * 100
    : null;

  return {
    address: item.TokenHolderAddress,
    amount,
    sharePct,
  };
}

export async function fetchChainIntel(args: FetchChainIntelArgs): Promise<ChainIntelPayload> {
  const target = await resolveChainTarget(args.chain, args.chainId);
  const { address, addressSource } = resolveAddress(args, target);

  if (target.family === 'solana' && args.entity === 'token') {
    if (!hasSolscanKey()) {
      return buildSolanaTokenBlockedPayload(
        address,
        addressSource,
        'SOLSCAN_API_KEY missing, placeholder-like, or too short for Solscan Pro API.',
      );
    }

    const intel = await fetchSolscanTokenIntel(address);
    if (!intel) {
      return buildSolanaTokenBlockedPayload(
        address,
        addressSource,
        'Solscan rejected or failed the request. Verify the key is an active Solscan Pro token and not another Solana provider credential.',
      );
    }

    const top10Share = sumTopHolderShare(intel.topHolders, 10);

    return {
      family: 'solana',
      chain: 'solana',
      chainId: null,
      chainLabel: 'Solana',
      entity: 'token',
      address,
      addressSource,
      at: Date.now(),
      summary: {
        title: intel.symbol ? `${intel.symbol} Solana token intel` : 'Solana token intel',
        subtitle: addressSource === 'default'
          ? 'Default reference token loaded from Solscan.'
          : 'User-selected token loaded from Solscan.',
        keySignals: [
          signal('price_usd', 'Price', intel.priceUsd, 'USD'),
          signal('market_cap_usd', 'Market cap', intel.marketCapUsd, 'USD'),
          signal('holders', 'Holders', intel.holderCount),
          signal('top10_holder_share_pct', 'Top 10 holder share', top10Share, '%', 'Approximate concentration based on holder balances and reported supply.'),
          signal('dex_volume_24h_usd', 'DEX volume 24h', intel.dexVolume24hUsd ?? intel.volume24hUsd, 'USD'),
        ],
        nextChecks: [
          'Compare holder concentration against top-pool liquidity.',
          'Watch transfer bursts versus DEX volume in the last 24h.',
          'Review mint and freeze authorities before treating the token as neutral.',
        ],
      },
      providers: {
        meta: providerState('solscan', 'live', 'token/meta is live.'),
        holders: providerState(
          'solscan',
          intel.topHolders.length > 0 ? 'live' : 'partial',
          intel.topHolders.length > 0 ? 'token/holders is live.' : 'token/holders returned no parsed rows.',
        ),
        markets: providerState(
          'solscan',
          intel.markets.length > 0 ? 'live' : 'partial',
          intel.markets.length > 0 ? 'token/markets is live.' : 'token/markets returned no parsed rows.',
        ),
        activity: providerState(
          'solscan',
          intel.recentActivity.length > 0 ? 'live' : 'partial',
          intel.recentActivity.length > 0 ? 'token/transfer is live.' : 'token/transfer returned no parsed rows.',
        ),
      },
      asset: {
        name: intel.name,
        symbol: intel.symbol,
        iconUrl: intel.iconUrl,
        decimals: intel.decimals,
        priceUsd: intel.priceUsd,
        priceChange24hPct: intel.priceChange24hPct,
        marketCapUsd: intel.marketCapUsd,
        volume24hUsd: intel.volume24hUsd,
        dexVolume24hUsd: intel.dexVolume24hUsd,
        supply: intel.supply,
        holderCount: intel.holderCount,
        creator: intel.creator,
        createdTimeMs: intel.createdTimeMs,
        mintAuthority: intel.mintAuthority,
        freezeAuthority: intel.freezeAuthority,
      },
      topHolders: intel.topHolders,
      markets: intel.markets,
      recentActivity: intel.recentActivity,
    };
  }

  if (target.family === 'solana' && args.entity === 'account') {
    if (!hasSolscanKey()) {
      return buildSolanaAccountBlockedPayload(
        address,
        addressSource,
        'SOLSCAN_API_KEY missing, placeholder-like, or too short for Solscan Pro API.',
      );
    }

    const intel = await fetchSolscanAccountIntel(address);
    if (!intel) {
      return buildSolanaAccountBlockedPayload(
        address,
        addressSource,
        'Solscan rejected or failed the request. Verify the key is an active Solscan Pro token and not another Solana provider credential.',
      );
    }

    return {
      family: 'solana',
      chain: 'solana',
      chainId: null,
      chainLabel: 'Solana',
      entity: 'account',
      address,
      addressSource,
      at: Date.now(),
      summary: {
        title: 'Solana account intel',
        subtitle: addressSource === 'default'
          ? 'Default Solana account loaded from Solscan.'
          : 'User-selected Solana account loaded from Solscan.',
        keySignals: [
          signal('sol_balance', 'SOL balance', intel.solBalance, 'SOL'),
          signal('account_type', 'Type', intel.type),
          signal('executable', 'Executable', intel.executable == null ? null : String(intel.executable)),
          signal('owner_program', 'Owner program', intel.ownerProgram),
        ],
        nextChecks: [
          'Pair account/detail with transfer coverage before using it for wallet monitoring.',
          'Check whether the account is executable or merely a token holder.',
          'Use owner program to classify protocol-owned accounts.',
        ],
      },
      providers: {
        account: providerState('solscan', 'live', 'account/detail is live.'),
      },
      account: {
        lamports: intel.lamports,
        solBalance: intel.solBalance,
        type: intel.type,
        executable: intel.executable,
        ownerProgram: intel.ownerProgram,
        rentEpoch: intel.rentEpoch,
        isOnCurve: intel.isOnCurve,
      },
    };
  }

  if (target.family === 'tron' && args.entity === 'token') {
    if (!hasTronscanKey()) {
      return buildTronTokenBlockedPayload(
        address,
        addressSource,
        'TRONSCAN_API_KEY missing, placeholder-like, or too short for TRONSCAN.',
      );
    }

    const intel = await fetchTronscanTokenIntel(address);
    if (!intel) {
      return buildTronTokenBlockedPayload(
        address,
        addressSource,
        'TRONSCAN rejected or failed the request. Verify the key is an active TRONSCAN API key for mainnet.',
      );
    }

    const top10Share = sumTopHolderShare(intel.topHolders, 10);

    return {
      family: 'tron',
      chain: 'tron',
      chainId: null,
      chainLabel: 'TRON',
      entity: 'token',
      address,
      addressSource,
      at: Date.now(),
      summary: {
        title: intel.symbol ? `${intel.symbol} TRON token intel` : 'TRON token intel',
        subtitle: addressSource === 'default'
          ? 'Default TRON reference token loaded from TRONSCAN.'
          : 'User-selected TRON token loaded from TRONSCAN.',
        keySignals: [
          signal('price_usd', 'Price', intel.priceUsd, 'USD'),
          signal('liquidity_24h_usd', 'Liquidity 24h', intel.liquidity24hUsd, 'USD'),
          signal('holder_count', 'Holders', intel.holderCount),
          signal('top10_holder_share_pct', 'Top 10 holder share', top10Share, '%'),
          signal('total_supply', 'Total supply', intel.totalSupply),
        ],
        nextChecks: [
          'Check whether holder concentration is exchange-heavy or burn-heavy.',
          'Compare 24h liquidity against transfer bursts before treating the token as liquid.',
          'Review issuer and homepage before assuming protocol legitimacy.',
        ],
      },
      providers: {
        meta: providerState(
          'tronscan',
          intel.name || intel.symbol ? 'live' : 'partial',
          intel.name || intel.symbol ? 'contract + token summary endpoints are live.' : 'Token meta parsed partially from TRONSCAN.',
        ),
        holders: providerState(
          'tronscan',
          intel.topHolders.length > 0 ? 'live' : 'partial',
          intel.topHolders.length > 0 ? 'token_trc20/holders is live.' : 'No TRON holder rows were parsed from the latest page.',
        ),
        transfers: providerState(
          'tronscan',
          intel.recentActivity.length > 0 ? 'live' : 'partial',
          intel.recentActivity.length > 0 ? 'token_trc20/transfers is live.' : 'No token transfer rows were parsed from the latest page.',
        ),
        supply: providerState(
          'tronscan',
          intel.totalSupply != null ? 'live' : 'partial',
          intel.totalSupply != null ? 'token_trc20/totalSupply is live.' : 'Token supply was not returned by TRONSCAN.',
        ),
      },
      asset: {
        name: intel.name,
        symbol: intel.symbol,
        iconUrl: intel.iconUrl,
        decimals: intel.decimals,
        priceUsd: intel.priceUsd,
        liquidity24hUsd: intel.liquidity24hUsd,
        holderCount: intel.holderCount,
        totalSupply: intel.totalSupply,
        issuer: intel.issuer,
        homePage: intel.homePage,
        description: intel.description,
      },
      topHolders: intel.topHolders,
      recentActivity: intel.recentActivity,
    };
  }

  if (target.family === 'tron' && args.entity === 'account') {
    if (!hasTronscanKey()) {
      return buildTronAccountBlockedPayload(
        address,
        addressSource,
        'TRONSCAN_API_KEY missing, placeholder-like, or too short for TRONSCAN.',
      );
    }

    const intel = await fetchTronscanAccountIntel(address);
    if (!intel) {
      return buildTronAccountBlockedPayload(
        address,
        addressSource,
        'TRONSCAN rejected or failed the request. Verify the key is an active TRONSCAN API key for mainnet.',
      );
    }

    return {
      family: 'tron',
      chain: 'tron',
      chainId: null,
      chainLabel: 'TRON',
      entity: 'account',
      address,
      addressSource,
      at: Date.now(),
      summary: {
        title: 'TRON account intel',
        subtitle: addressSource === 'default'
          ? 'Default TRON reference account loaded from TRONSCAN.'
          : 'User-selected TRON account loaded from TRONSCAN.',
        keySignals: [
          signal('trx_balance', 'TRX balance', intel.balanceTrx, 'TRX'),
          signal('recent_transactions', 'Recent native tx', intel.recentTransactions.length),
          signal('recent_trc20_transfers', 'Recent TRC20 transfers', intel.recentTrc20Transfers.length),
          signal('tracked_trc20_tokens', 'Tracked TRC20 balances', intel.trc20TokenCount),
          signal('latest_activity', 'Latest activity', intel.latestOperationTimeMs),
        ],
        nextChecks: [
          'Compare native TRX movement with recent TRC20 flow.',
          'Watch whether inbound TRC20 flow is concentrated in a single token.',
          'If the address is a contract, classify it separately from a treasury wallet.',
        ],
      },
      providers: {
        account: providerState('tronscan', 'live', 'accountv2 is live.'),
        transactions: providerState(
          'tronscan',
          intel.recentTransactions.length > 0 ? 'live' : 'partial',
          intel.recentTransactions.length > 0
            ? 'transfer is live.'
            : 'No native transfer rows were parsed from the latest page.',
        ),
        trc20: providerState(
          'tronscan',
          intel.recentTrc20Transfers.length > 0 ? 'live' : 'partial',
          intel.recentTrc20Transfers.length > 0
            ? 'token_trc20/transfers-with-status is live.'
            : 'No TRC20 transfer rows were parsed from the latest page.',
        ),
      },
      account: {
        balanceSun: intel.balanceSun,
        balanceTrx: intel.balanceTrx,
        createTimeMs: intel.createTimeMs,
        latestOperationTimeMs: intel.latestOperationTimeMs,
        freeNetUsed: intel.freeNetUsed,
        energyUsed: intel.energyUsed,
        trc20TokenCount: intel.trc20TokenCount,
      },
      recentTransactions: intel.recentTransactions,
      recentTrc20Transfers: intel.recentTrc20Transfers,
    };
  }

  if (args.entity === 'account') {
    if (!hasEtherscanApiKey()) {
      return buildEvmAccountBlockedPayload(
        target,
        address,
        addressSource,
        'ETHERSCAN_API_KEY missing, placeholder-like, or too short for Etherscan V2.',
      );
    }

    const [balanceRaw, transactions, holdingsRaw, labelRows] = await Promise.all([
      fetchNativeBalance(address, { chainId: target.chainId ?? '1' }),
      fetchNormalTxList(address, '0', '99999999', 'desc', { chainId: target.chainId ?? '1' }),
      fetchAddressTokenBalance(address, '1', '20', { chainId: target.chainId ?? '1' }),
      fetchAddressTag(address, { chainId: target.chainId ?? '1' }),
    ]);

    if (balanceRaw == null && !transactions && !holdingsRaw && !labelRows) {
      return buildEvmAccountBlockedPayload(
        target,
        address,
        addressSource,
        'Etherscan V2 rejected or failed the request. Verify the key is active and the chainid is supported.',
      );
    }

    const tokenHoldings = (holdingsRaw ?? []).map(mapEvmHolding);
    const labels = mapEvmLabels(labelRows ?? []);
    const label = labels[0]?.label ?? null;
    const portfolioUsd = sumPortfolioUsd(tokenHoldings);
    const balanceNative = scaleAmount(balanceRaw, 18);

    return {
      family: 'evm',
      chain: target.chain,
      chainId: target.chainId,
      chainLabel: target.chainLabel,
      entity: 'account',
      address,
      addressSource,
      at: Date.now(),
      summary: {
        title: `${target.chainLabel} account intel`,
        subtitle: addressSource === 'default'
          ? `Default ${target.chainLabel} reference account loaded from Etherscan V2.`
          : `User-selected ${target.chainLabel} account loaded from Etherscan V2.`,
        keySignals: [
          signal('native_balance', `${target.nativeSymbol ?? 'Native'} balance`, balanceNative, target.nativeSymbol ?? 'NATIVE'),
          signal('portfolio_usd', 'Token portfolio', portfolioUsd, 'USD'),
          signal('token_holdings', 'Tracked token holdings', tokenHoldings.length),
          signal('recent_transactions', 'Recent transactions', transactions?.length ?? 0),
          signal('address_label', 'Name tag', label),
        ],
        nextChecks: [
          'Review token holdings by USD value before treating the wallet as diversified.',
          'Interpret name tags carefully because getaddresstag is a paid Etherscan lane.',
          'Use chainid explicitly when comparing the same wallet across EVM chains.',
        ],
      },
      providers: {
        balance: providerState(
          'etherscan',
          balanceRaw != null ? 'live' : 'blocked',
          balanceRaw != null ? 'account/balance is live.' : 'Native balance was not returned by Etherscan V2.',
        ),
        transactions: providerState(
          'etherscan',
          transactions ? (transactions.length > 0 ? 'live' : 'partial') : 'blocked',
          transactions
            ? (transactions.length > 0 ? 'account/txlist is live.' : 'No normal transactions were returned for this address.')
            : 'Normal transactions could not be loaded from Etherscan V2.',
        ),
        holdings: providerState(
          'etherscan',
          holdingsRaw ? (tokenHoldings.length > 0 ? 'live' : 'partial') : 'blocked',
          holdingsRaw
            ? (tokenHoldings.length > 0 ? 'account/addresstokenbalance is live.' : 'No token holdings were returned for this address.')
            : 'Address token balance endpoint could not be loaded from Etherscan V2.',
        ),
        labels: providerState(
          'etherscan',
          labelRows ? (labels.length > 0 ? 'live' : 'partial') : 'blocked',
          labelRows
            ? (labels.length > 0 ? 'nametag/getaddresstag is live.' : 'No name tags were returned for this address.')
            : 'Address metadata endpoint is unavailable, likely due plan limits or provider failure.',
        ),
      },
      account: {
        nativeSymbol: target.nativeSymbol ?? 'NATIVE',
        balanceRaw,
        balanceNative,
        portfolioUsd,
        label,
      },
      labels,
      tokenHoldings,
      recentTransactions: (transactions ?? []).map((item) => mapEvmTransaction(item, address, target.nativeSymbol ?? 'NATIVE')),
    };
  }

  const hasEtherscan = hasEtherscanApiKey();
  const hasCoinGecko = hasCoinGeckoApiKey();

  if (!hasEtherscan && !hasCoinGecko) {
    return buildEvmTokenBlockedPayload(
      target,
      address,
      addressSource,
      'ETHERSCAN_API_KEY and COINGECKO_API_KEY are both missing, placeholder-like, or too short for the EVM token lane.',
    );
  }

  const [metaRows, holderCount, topHolderRows, totalSupplyRaw, dexIntel] = await Promise.all([
    hasEtherscan ? fetchTokenInfo(address, { chainId: target.chainId ?? '1' }) : Promise.resolve(null),
    hasEtherscan ? fetchTokenHolderCount(address, { chainId: target.chainId ?? '1' }) : Promise.resolve(null),
    hasEtherscan ? fetchTopTokenHolders(address, '20', { chainId: target.chainId ?? '1' }) : Promise.resolve(null),
    hasEtherscan ? fetchTokenSupply(address, { chainId: target.chainId ?? '1' }) : Promise.resolve(null),
    hasCoinGecko
      ? fetchCoinGeckoOnchainTokenIntel({
          chain: target.chain,
          chainId: target.chainId,
          chainLabel: target.chainLabel,
          aliases: target.aliases,
          address,
        })
      : Promise.resolve(null),
  ]);

  if (!metaRows && holderCount == null && !topHolderRows && totalSupplyRaw == null && !dexIntel) {
    return buildEvmTokenBlockedPayload(
      target,
      address,
      addressSource,
      'Etherscan V2 and CoinGecko onchain both failed for this token. Verify the keys and explicit chainid coverage.',
    );
  }

  const meta = metaRows?.[0] ?? null;
  const decimals = toNumber(meta?.divisor) ?? dexIntel?.decimals ?? null;
  const totalSupply = scaleAmount(totalSupplyRaw ?? meta?.totalSupply, decimals ?? 0);
  const topHolders = (topHolderRows ?? []).map((item) => mapEvmTopHolder(item, decimals, totalSupply));
  const top10Share = sumTopHolderShare(topHolders, 10);
  const symbol = toStringValue(meta?.symbol) ?? dexIntel?.symbol ?? null;
  const name = toStringValue(meta?.tokenName) ?? dexIntel?.name ?? null;
  const priceUsd = toNumber(meta?.tokenPriceUSD) ?? dexIntel?.priceUsd ?? null;
  const providerLabel = meta || holderCount != null || topHolderRows || totalSupplyRaw != null
    ? dexIntel
      ? 'Etherscan V2 + CoinGecko onchain'
      : 'Etherscan V2'
    : 'CoinGecko onchain';

  return {
    family: 'evm',
    chain: target.chain,
    chainId: target.chainId,
    chainLabel: target.chainLabel,
    entity: 'token',
    address,
    addressSource,
    at: Date.now(),
    summary: {
      title: symbol ? `${symbol} ${target.chainLabel} token intel` : `${target.chainLabel} token intel`,
      subtitle: addressSource === 'default'
        ? `Default ${target.chainLabel} reference token loaded from ${providerLabel}.`
        : `User-selected ${target.chainLabel} token loaded from ${providerLabel}.`,
      keySignals: [
        signal('price_usd', 'Price', priceUsd, 'USD'),
        signal('holder_count', 'Holders', holderCount),
        signal('total_supply', 'Total supply', totalSupply),
        signal('top10_holder_share_pct', 'Top 10 holder share', top10Share, '%'),
        signal('liquidity_usd', 'DEX liquidity', dexIntel?.liquidityUsd ?? null, 'USD'),
        signal('dex_volume_24h_usd', 'DEX volume 24h', dexIntel?.dexVolume24hUsd ?? null, 'USD'),
        signal('blue_checkmark', 'Blue checkmark', toBoolean(meta?.blueCheckmark) == null ? null : String(toBoolean(meta?.blueCheckmark))),
      ],
      nextChecks: [
        'Treat tokeninfo and topholders as plan-dependent Etherscan lanes.',
        'Use DEX liquidity and recent trades to judge whether holder concentration is actually tradeable.',
        'Specify chainid explicitly when the same token symbol exists on multiple EVM chains.',
      ],
    },
    providers: {
      meta: providerState(
        meta ? 'etherscan' : dexIntel?.tokenLoaded ? 'coingecko' : 'etherscan',
        meta ? 'live' : dexIntel?.tokenLoaded ? 'partial' : 'blocked',
        meta
          ? 'token/tokeninfo is live.'
          : dexIntel?.tokenLoaded
            ? 'Token profile was backfilled from CoinGecko onchain because Etherscan tokeninfo was unavailable.'
            : 'Token metadata endpoint is unavailable, likely due plan limits or provider failure.',
      ),
      holderCount: providerState(
        'etherscan',
        holderCount != null ? 'live' : 'blocked',
        holderCount != null ? 'token/tokenholdercount is live.' : 'Token holder count was not returned by Etherscan V2.',
      ),
      topHolders: providerState(
        'etherscan',
        topHolderRows ? (topHolders.length > 0 ? 'live' : 'partial') : 'blocked',
        topHolderRows
          ? (topHolders.length > 0 ? 'token/topholders is live.' : 'No top-holder rows were returned for this token.')
          : 'Top-holder endpoint is unavailable, likely due plan limits or provider failure.',
      ),
      supply: providerState(
        'etherscan',
        totalSupply != null ? 'live' : 'blocked',
        totalSupply != null ? 'stats/tokensupply is live.' : 'Token supply was not returned by Etherscan V2.',
      ),
      dex: providerState(
        'coingecko',
        dexIntel?.markets.length ? 'live' : dexIntel?.tokenLoaded || dexIntel?.poolsLoaded ? 'partial' : 'blocked',
        dexIntel?.markets.length
          ? `CoinGecko onchain DEX pools are live on ${dexIntel.networkId}.`
          : dexIntel?.tokenLoaded || dexIntel?.poolsLoaded
            ? 'CoinGecko onchain resolved the token network but returned no parsed DEX markets.'
            : 'CoinGecko onchain DEX market coverage is unavailable for this token.',
      ),
      dexTrades: providerState(
        'coingecko',
        dexIntel?.recentActivity.length ? 'live' : dexIntel?.tradesLoaded ? 'partial' : 'blocked',
        dexIntel?.recentActivity.length
          ? 'CoinGecko onchain recent DEX trades are live.'
          : dexIntel?.tradesLoaded
            ? 'CoinGecko onchain trades endpoint returned no parsed rows.'
            : 'CoinGecko onchain trade coverage is unavailable for this token.',
      ),
    },
    asset: {
      name,
      symbol,
      iconUrl: dexIntel?.iconUrl ?? null,
      decimals,
      priceUsd,
      priceChange24hPct: dexIntel?.priceChange24hPct ?? null,
      marketCapUsd: dexIntel?.marketCapUsd ?? null,
      fdvUsd: dexIntel?.fdvUsd ?? null,
      liquidityUsd: dexIntel?.liquidityUsd ?? null,
      dexVolume24hUsd: dexIntel?.dexVolume24hUsd ?? null,
      dexNetworkId: dexIntel?.networkId ?? null,
      totalSupply,
      holderCount,
      website: toStringValue(meta?.website),
      description: toStringValue(meta?.description),
      blueCheckmark: toBoolean(meta?.blueCheckmark),
    },
    topHolders,
    markets: dexIntel?.markets ?? [],
    recentActivity: dexIntel?.recentActivity ?? [],
  };
}

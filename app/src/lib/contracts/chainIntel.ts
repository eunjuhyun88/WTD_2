export type ChainIntelFamily = 'solana' | 'tron' | 'evm';
export type ChainIntelChain = string;
export type ChainIntelEntity = 'token' | 'account';
export type ChainIntelProviderStatus = 'live' | 'partial' | 'blocked' | 'planned';
export type ChainIntelAddressSource = 'user' | 'default';

export interface ChainIntelProviderState {
  provider: string;
  status: ChainIntelProviderStatus;
  detail?: string;
  updatedAt?: number | null;
}

export interface ChainIntelSignal {
  id: string;
  label: string;
  value: number | string | null;
  unit?: string;
  note?: string;
}

export interface ChainIntelSummary {
  title: string;
  subtitle: string;
  keySignals: ChainIntelSignal[];
  nextChecks: string[];
}

export interface ChainIntelHolder {
  address: string;
  owner?: string | null;
  amount?: number | string | null;
  valueUsd?: number | null;
  rank?: number | null;
  sharePct?: number | null;
}

export interface ChainIntelMarket {
  venue: string;
  pair?: string | null;
  volume24hUsd?: number | null;
  tvlUsd?: number | null;
  tradeCount24h?: number | null;
  priceUsd?: number | null;
}

export interface ChainIntelActivity {
  id: string;
  timestampMs: number | null;
  direction?: 'in' | 'out' | 'internal' | 'unknown';
  from?: string | null;
  to?: string | null;
  amount?: string | number | null;
  symbol?: string | null;
  note?: string | null;
}

export interface ChainIntelTokenHolding {
  tokenAddress: string;
  name?: string | null;
  symbol?: string | null;
  quantity?: string | number | null;
  decimals?: number | null;
  priceUsd?: number | null;
  valueUsd?: number | null;
}

export interface ChainIntelLabel {
  label: string;
  slug?: string | null;
  url?: string | null;
  reputation?: number | null;
}

export interface ChainIntelBasePayload {
  family: ChainIntelFamily;
  chain: ChainIntelChain;
  chainId: string | null;
  chainLabel: string;
  entity: ChainIntelEntity;
  address: string;
  addressSource: ChainIntelAddressSource;
  at: number;
  summary: ChainIntelSummary;
}

export interface SolanaTokenIntelPayload extends ChainIntelBasePayload {
  family: 'solana';
  chain: 'solana';
  chainId: null;
  entity: 'token';
  providers: {
    meta: ChainIntelProviderState;
    holders: ChainIntelProviderState;
    markets: ChainIntelProviderState;
    activity: ChainIntelProviderState;
  };
  asset: {
    name: string | null;
    symbol: string | null;
    iconUrl: string | null;
    decimals: number | null;
    priceUsd: number | null;
    priceChange24hPct: number | null;
    marketCapUsd: number | null;
    volume24hUsd: number | null;
    dexVolume24hUsd: number | null;
    supply: number | null;
    holderCount: number | null;
    creator: string | null;
    createdTimeMs: number | null;
    mintAuthority: string | null;
    freezeAuthority: string | null;
  };
  topHolders: ChainIntelHolder[];
  markets: ChainIntelMarket[];
  recentActivity: ChainIntelActivity[];
}

export interface SolanaAccountIntelPayload extends ChainIntelBasePayload {
  family: 'solana';
  chain: 'solana';
  chainId: null;
  entity: 'account';
  providers: {
    account: ChainIntelProviderState;
  };
  account: {
    lamports: number | null;
    solBalance: number | null;
    type: string | null;
    executable: boolean | null;
    ownerProgram: string | null;
    rentEpoch: number | null;
    isOnCurve: boolean | null;
  };
}

export interface TronTokenIntelPayload extends ChainIntelBasePayload {
  family: 'tron';
  chain: 'tron';
  chainId: null;
  entity: 'token';
  providers: {
    meta: ChainIntelProviderState;
    holders: ChainIntelProviderState;
    transfers: ChainIntelProviderState;
    supply: ChainIntelProviderState;
  };
  asset: {
    name: string | null;
    symbol: string | null;
    iconUrl: string | null;
    decimals: number | null;
    priceUsd: number | null;
    liquidity24hUsd: number | null;
    holderCount: number | null;
    totalSupply: number | null;
    issuer: string | null;
    homePage: string | null;
    description: string | null;
  };
  topHolders: ChainIntelHolder[];
  recentActivity: ChainIntelActivity[];
}

export interface TronAccountIntelPayload extends ChainIntelBasePayload {
  family: 'tron';
  chain: 'tron';
  chainId: null;
  entity: 'account';
  providers: {
    account: ChainIntelProviderState;
    transactions: ChainIntelProviderState;
    trc20: ChainIntelProviderState;
  };
  account: {
    balanceSun: number | null;
    balanceTrx: number | null;
    createTimeMs: number | null;
    latestOperationTimeMs: number | null;
    freeNetUsed: number | null;
    energyUsed: number | null;
    trc20TokenCount: number | null;
  };
  recentTransactions: ChainIntelActivity[];
  recentTrc20Transfers: ChainIntelActivity[];
}

export interface EvmAccountIntelPayload extends ChainIntelBasePayload {
  family: 'evm';
  entity: 'account';
  providers: {
    balance: ChainIntelProviderState;
    transactions: ChainIntelProviderState;
    holdings: ChainIntelProviderState;
    labels: ChainIntelProviderState;
  };
  account: {
    nativeSymbol: string;
    balanceRaw: string | null;
    balanceNative: number | null;
    portfolioUsd: number | null;
    label: string | null;
  };
  labels: ChainIntelLabel[];
  tokenHoldings: ChainIntelTokenHolding[];
  recentTransactions: ChainIntelActivity[];
}

export interface EvmTokenIntelPayload extends ChainIntelBasePayload {
  family: 'evm';
  entity: 'token';
  providers: {
    meta: ChainIntelProviderState;
    holderCount: ChainIntelProviderState;
    topHolders: ChainIntelProviderState;
    supply: ChainIntelProviderState;
    dex: ChainIntelProviderState;
    dexTrades: ChainIntelProviderState;
  };
  asset: {
    name: string | null;
    symbol: string | null;
    iconUrl: string | null;
    decimals: number | null;
    priceUsd: number | null;
    priceChange24hPct: number | null;
    marketCapUsd: number | null;
    fdvUsd: number | null;
    liquidityUsd: number | null;
    dexVolume24hUsd: number | null;
    dexNetworkId: string | null;
    totalSupply: number | null;
    holderCount: number | null;
    website: string | null;
    description: string | null;
    blueCheckmark: boolean | null;
  };
  topHolders: ChainIntelHolder[];
  markets: ChainIntelMarket[];
  recentActivity: ChainIntelActivity[];
}

export type ChainIntelPayload =
  | SolanaTokenIntelPayload
  | SolanaAccountIntelPayload
  | TronTokenIntelPayload
  | TronAccountIntelPayload
  | EvmAccountIntelPayload
  | EvmTokenIntelPayload;

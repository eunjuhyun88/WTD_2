import { env } from '$env/dynamic/private';
import type { ChainIntelActivity, ChainIntelHolder } from '$lib/contracts/chainIntel';
import { getCached, setCache } from '$lib/server/providers/cache';

const BASE_URL = 'https://apilist.tronscanapi.com/api';
const CACHE_TTL_MS = 60_000;
const PLACEHOLDER_HINTS = ['your_', 'your-', 'placeholder', 'changeme', 'example', 'dummy', '<'];
const SUN_PER_TRX = 1_000_000;

interface TronscanAccountDetail {
  address?: string;
  balance?: number | string;
  latest_operation_time?: number | string;
  date_created?: number | string;
  bandwidth?: {
    freeNetUsed?: number | string;
    energyUsed?: number | string;
  };
  withPriceTokens?: Array<{
    tokenId?: string;
  }>;
}

interface TronscanTransferList {
  data?: TronscanTransferItem[];
}

interface TronscanTransferItem {
  transactionHash?: string;
  block_ts?: number | string;
  transferFromAddress?: string;
  transferToAddress?: string;
  amount?: number | string;
  contractRet?: string;
  tokenInfo?: {
    tokenAbbr?: string;
    tokenName?: string;
    tokenDecimal?: number | string;
  };
}

interface TronscanAccountTrc20TransferList {
  data?: TronscanAccountTrc20TransferItem[];
}

interface TronscanAccountTrc20TransferItem {
  hash?: string;
  block_timestamp?: number | string;
  from?: string;
  to?: string;
  amount?: number | string;
  decimals?: number | string;
  token_name?: string;
  contract_ret?: string;
  final_result?: string;
  event_type?: string;
}

interface TronscanContractEnvelope {
  data?: TronscanContractDetail[];
}

interface TronscanContractDetail {
  trc20token?: {
    icon_url?: string;
    iconUrl?: string;
    symbol?: string;
    total_supply?: string;
    totalSupply?: string;
    contract_address?: string;
    contractAddress?: string;
    issuer_addr?: string;
    issuerAddr?: string;
    home_page?: string;
    homePage?: string;
    token_desc?: string;
    tokenDesc?: string;
    holders_count?: string | number;
    holderCount?: string | number;
    decimals?: string | number;
    tokenDecimal?: string | number;
    name?: string;
    tokenName?: string;
  };
  trc20Token?: {
    icon_url?: string;
    iconUrl?: string;
    symbol?: string;
    total_supply?: string;
    totalSupply?: string;
    contract_address?: string;
    contractAddress?: string;
    issuer_addr?: string;
    issuerAddr?: string;
    home_page?: string;
    homePage?: string;
    token_desc?: string;
    tokenDesc?: string;
    holders_count?: string | number;
    holderCount?: string | number;
    decimals?: string | number;
    tokenDecimal?: string | number;
    name?: string;
    tokenName?: string;
  };
  tag1?: string;
  tag1Url?: string;
}

interface TronscanTokenTransferEnvelope {
  token_transfers?: TronscanTokenTransferItem[];
}

interface TronscanTokenTransferItem {
  transaction_id?: string;
  block_ts?: number | string;
  from_address?: string;
  to_address?: string;
  quant?: number | string;
  contractRet?: string;
  finalResult?: string;
  tokenInfo?: {
    tokenAbbr?: string;
    tokenName?: string;
    tokenDecimal?: number | string;
  };
}

interface TronscanTokenHolderEnvelope {
  trc20_tokens?: TronscanTokenHolderItem[];
}

interface TronscanTokenHolderItem {
  holder_address?: string;
  balance?: number | string;
  addressTag?: string;
}

interface TronscanTokenSummaryEnvelope {
  trc20_tokens?: TronscanTokenSummaryItem[];
}

interface TronscanTokenSummaryItem {
  symbol?: string;
  name?: string;
  tokenName?: string;
  icon_url?: string;
  iconUrl?: string;
  tokenLogo?: string;
  decimals?: number | string;
  decimal?: number | string;
  tokenDecimal?: number | string;
  liquidity24h?: number | string;
  holders_count?: number | string;
  holdersCount?: number | string;
  home_page?: string;
  homePage?: string;
  issuer_addr?: string;
  issuerAddr?: string;
  token_desc?: string;
  tokenDesc?: string;
  total_supply?: string;
  totalSupply?: string;
  tokenPriceLine?: {
    data?: Array<{
      priceUsd?: number | string;
    }>;
  };
}

export interface TronscanAccountIntel {
  address: string;
  balanceSun: number | null;
  balanceTrx: number | null;
  createTimeMs: number | null;
  latestOperationTimeMs: number | null;
  freeNetUsed: number | null;
  energyUsed: number | null;
  trc20TokenCount: number | null;
  recentTransactions: ChainIntelActivity[];
  recentTrc20Transfers: ChainIntelActivity[];
}

export interface TronscanTokenIntel {
  address: string;
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
  topHolders: ChainIntelHolder[];
  recentActivity: ChainIntelActivity[];
}

function apiKey(): string {
  return env.TRONSCAN_API_KEY ?? env.TRONGRID_API_KEY ?? '';
}

function isUsableApiKey(value: string, minLength = 20): boolean {
  const trimmed = value.trim();
  if (trimmed.length < minLength) return false;
  const lower = trimmed.toLowerCase();
  return !PLACEHOLDER_HINTS.some((hint) => lower.includes(hint));
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toStringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function toTimestampMs(value: unknown): number | null {
  const numeric = toNumber(value);
  if (numeric == null) return null;
  return numeric >= 1_000_000_000_000 ? Math.round(numeric) : Math.round(numeric * 1000);
}

function normalizeTokenAmount(value: unknown, decimals: unknown): number | string | null {
  const raw = toStringValue(value);
  const decimalPlaces = toNumber(decimals);
  const numeric = toNumber(value);
  if (numeric == null) return raw;
  if (decimalPlaces == null || !Number.isInteger(decimalPlaces) || decimalPlaces < 0 || decimalPlaces > 18) {
    return raw ?? numeric;
  }
  return numeric / 10 ** decimalPlaces;
}

function inferDirection(address: string, from: string | null, to: string | null): ChainIntelActivity['direction'] {
  if (from === address && to === address) return 'internal';
  if (from === address) return 'out';
  if (to === address) return 'in';
  return 'unknown';
}

async function tronscanFetch<T>(path: string, params?: URLSearchParams): Promise<T | null> {
  const key = apiKey();
  if (!isUsableApiKey(key)) return null;

  const query = params?.toString() ?? '';
  const cacheKey = `tronscan:${path}:${query}`;
  const cached = getCached<T>(cacheKey);
  if (cached) return cached;

  const url = query ? `${BASE_URL}${path}?${query}` : `${BASE_URL}${path}`;

  try {
    const res = await fetch(url, {
      headers: {
        accept: 'application/json',
        'TRON-PRO-API-KEY': key,
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      console.error(`[TRONSCAN] ${path}: ${res.status} ${res.statusText}`);
      return null;
    }

    const json = (await res.json()) as T;
    setCache(cacheKey, json, CACHE_TTL_MS);
    return json;
  } catch (error) {
    console.error('[TRONSCAN] fetch error:', error);
    return null;
  }
}

function mapNativeTransfer(item: TronscanTransferItem, address: string): ChainIntelActivity | null {
  const id = toStringValue(item.transactionHash);
  if (!id) return null;

  const from = toStringValue(item.transferFromAddress);
  const to = toStringValue(item.transferToAddress);
  const amount = normalizeTokenAmount(item.amount, item.tokenInfo?.tokenDecimal);

  return {
    id,
    timestampMs: toTimestampMs(item.block_ts),
    direction: inferDirection(address, from, to),
    from,
    to,
    amount,
    symbol: toStringValue(item.tokenInfo?.tokenAbbr) ?? toStringValue(item.tokenInfo?.tokenName),
    note: toStringValue(item.contractRet),
  };
}

function mapAccountTrc20Transfer(item: TronscanAccountTrc20TransferItem, address: string): ChainIntelActivity | null {
  const id = toStringValue(item.hash);
  if (!id) return null;

  const from = toStringValue(item.from);
  const to = toStringValue(item.to);

  return {
    id,
    timestampMs: toTimestampMs(item.block_timestamp),
    direction: inferDirection(address, from, to),
    from,
    to,
    amount: normalizeTokenAmount(item.amount, item.decimals),
    symbol: toStringValue(item.token_name),
    note:
      toStringValue(item.event_type) ??
      toStringValue(item.contract_ret) ??
      toStringValue(item.final_result),
  };
}

function mapTokenTransfer(item: TronscanTokenTransferItem, tokenAddress: string): ChainIntelActivity | null {
  const id = toStringValue(item.transaction_id);
  if (!id) return null;

  return {
    id,
    timestampMs: toTimestampMs(item.block_ts),
    direction: inferDirection(tokenAddress, toStringValue(item.from_address), toStringValue(item.to_address)),
    from: toStringValue(item.from_address),
    to: toStringValue(item.to_address),
    amount: normalizeTokenAmount(item.quant, item.tokenInfo?.tokenDecimal),
    symbol: toStringValue(item.tokenInfo?.tokenAbbr) ?? toStringValue(item.tokenInfo?.tokenName),
    note: toStringValue(item.contractRet) ?? toStringValue(item.finalResult),
  };
}

function mapTokenHolder(item: TronscanTokenHolderItem, decimals: number | null, totalSupply: number | null): ChainIntelHolder | null {
  const address = toStringValue(item.holder_address);
  if (!address) return null;

  const amount = normalizeTokenAmount(item.balance, decimals);
  const numericAmount = typeof amount === 'number' ? amount : toNumber(amount);
  const sharePct = numericAmount != null && totalSupply != null && totalSupply > 0
    ? (numericAmount / totalSupply) * 100
    : null;

  return {
    address,
    owner: toStringValue(item.addressTag),
    amount,
    sharePct,
  };
}

export function hasTronscanKey(): boolean {
  return isUsableApiKey(apiKey());
}

export async function fetchTronscanAccountIntel(address: string): Promise<TronscanAccountIntel | null> {
  const [accountDetail, nativeTransfers, trc20Transfers] = await Promise.all([
    tronscanFetch<TronscanAccountDetail>('/accountv2', new URLSearchParams({ address })),
    tronscanFetch<TronscanTransferList>('/transfer', new URLSearchParams({
      sort: '-timestamp',
      count: 'true',
      limit: '10',
      start: '0',
      address,
      filterTokenValue: '1',
    })),
    tronscanFetch<TronscanAccountTrc20TransferList>('/token_trc20/transfers-with-status', new URLSearchParams({
      limit: '10',
      start: '0',
      address,
      direction: '0',
      db_version: '1',
      reverse: 'true',
    })),
  ]);

  if (!accountDetail && !nativeTransfers?.data && !trc20Transfers?.data) return null;

  const balanceSun = toNumber(accountDetail?.balance);
  const tokenCount = Array.isArray(accountDetail?.withPriceTokens)
    ? accountDetail.withPriceTokens.filter((token) => token.tokenId && token.tokenId !== '_').length
    : null;

  return {
    address: toStringValue(accountDetail?.address) ?? address,
    balanceSun,
    balanceTrx: balanceSun != null ? balanceSun / SUN_PER_TRX : null,
    createTimeMs: toTimestampMs(accountDetail?.date_created),
    latestOperationTimeMs: toTimestampMs(accountDetail?.latest_operation_time),
    freeNetUsed: toNumber(accountDetail?.bandwidth?.freeNetUsed),
    energyUsed: toNumber(accountDetail?.bandwidth?.energyUsed),
    trc20TokenCount: tokenCount,
    recentTransactions: (nativeTransfers?.data ?? [])
      .map((item) => mapNativeTransfer(item, address))
      .filter((item): item is ChainIntelActivity => item != null),
    recentTrc20Transfers: (trc20Transfers?.data ?? [])
      .map((item) => mapAccountTrc20Transfer(item, address))
      .filter((item): item is ChainIntelActivity => item != null),
  };
}

export async function fetchTronscanTokenIntel(address: string): Promise<TronscanTokenIntel | null> {
  const [contractDetail, summary, holders, transfers, totalSupplyRaw] = await Promise.all([
    tronscanFetch<TronscanContractEnvelope>('/contract', new URLSearchParams({ contract: address })),
    tronscanFetch<TronscanTokenSummaryEnvelope>('/token_trc20', new URLSearchParams({
      contract: address,
      showAll: '1',
      start: '0',
      limit: '1',
    })),
    tronscanFetch<TronscanTokenHolderEnvelope>('/token_trc20/holders', new URLSearchParams({
      start: '0',
      limit: '10',
      contract_address: address,
      holder_address: '',
    })),
    tronscanFetch<TronscanTokenTransferEnvelope>('/token_trc20/transfers', new URLSearchParams({
      limit: '10',
      start: '0',
      contract_address: address,
      confirm: 'true',
      filterTokenValue: '1',
    })),
    tronscanFetch<string>('/token_trc20/totalSupply', new URLSearchParams({ address })),
  ]);

  const meta = contractDetail?.data?.[0]?.trc20token ?? contractDetail?.data?.[0]?.trc20Token;
  const metaSummary = summary?.trc20_tokens?.[0];
  if (!meta && !metaSummary && !holders?.trc20_tokens && !transfers?.token_transfers) return null;

  const decimals =
    toNumber(meta?.decimals) ??
    toNumber(meta?.tokenDecimal) ??
    toNumber(metaSummary?.decimals) ??
    toNumber(metaSummary?.decimal) ??
    toNumber(metaSummary?.tokenDecimal);
  const totalSupply =
    toNumber(totalSupplyRaw) ??
    toNumber(normalizeTokenAmount(
      meta?.total_supply ??
      meta?.totalSupply ??
      metaSummary?.total_supply ??
      metaSummary?.totalSupply,
      decimals,
    ));

  return {
    address,
    name:
      toStringValue(meta?.name) ??
      toStringValue(meta?.tokenName) ??
      toStringValue(metaSummary?.name) ??
      toStringValue(metaSummary?.tokenName) ??
      toStringValue(contractDetail?.data?.[0]?.tag1),
    symbol: toStringValue(meta?.symbol) ?? toStringValue(metaSummary?.symbol),
    iconUrl:
      toStringValue(meta?.icon_url) ??
      toStringValue(meta?.iconUrl) ??
      toStringValue(metaSummary?.icon_url) ??
      toStringValue(metaSummary?.iconUrl) ??
      toStringValue(metaSummary?.tokenLogo),
    decimals,
    priceUsd: toNumber(metaSummary?.tokenPriceLine?.data?.[0]?.priceUsd),
    liquidity24hUsd: toNumber(metaSummary?.liquidity24h),
    holderCount:
      toNumber(meta?.holders_count) ??
      toNumber(meta?.holderCount) ??
      toNumber(metaSummary?.holders_count) ??
      toNumber(metaSummary?.holdersCount),
    totalSupply,
    issuer:
      toStringValue(meta?.issuer_addr) ??
      toStringValue(meta?.issuerAddr) ??
      toStringValue(metaSummary?.issuer_addr) ??
      toStringValue(metaSummary?.issuerAddr),
    homePage:
      toStringValue(meta?.home_page) ??
      toStringValue(meta?.homePage) ??
      toStringValue(metaSummary?.home_page) ??
      toStringValue(metaSummary?.homePage) ??
      toStringValue(contractDetail?.data?.[0]?.tag1Url),
    description:
      toStringValue(meta?.token_desc) ??
      toStringValue(meta?.tokenDesc) ??
      toStringValue(metaSummary?.token_desc) ??
      toStringValue(metaSummary?.tokenDesc),
    topHolders: (holders?.trc20_tokens ?? [])
      .map((item) => mapTokenHolder(item, decimals, totalSupply))
      .filter((item): item is ChainIntelHolder => item != null),
    recentActivity: (transfers?.token_transfers ?? [])
      .map((item) => mapTokenTransfer(item, address))
      .filter((item): item is ChainIntelActivity => item != null),
  };
}

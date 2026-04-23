import { env } from '$env/dynamic/private';
import type {
  ChainIntelActivity,
  ChainIntelHolder,
  ChainIntelMarket,
} from '$lib/contracts/chainIntel';
import { getCached, setCache } from '$lib/server/providers/cache';

const BASE_URL = 'https://pro-api.solscan.io/v2.0';
const CACHE_TTL_MS = 60_000;
const PLACEHOLDER_HINTS = ['your_', 'your-', 'placeholder', 'changeme', 'example', 'dummy', '<'];
const LAMPORTS_PER_SOL = 1_000_000_000;

interface SolscanEnvelope<T> {
  success?: boolean;
  data?: T;
  errors?: Array<{ code?: number; message?: string }>;
}

interface SolscanTokenMeta {
  address?: string;
  name?: string;
  symbol?: string;
  icon?: string;
  decimals?: number | string;
  price?: number | string;
  volume_24h?: number | string;
  market_cap?: number | string;
  price_change_24h?: number | string;
  supply?: number | string;
  holder?: number | string;
  creator?: string;
  created_time?: number | string;
  mint_authority?: string;
  freeze_authority?: string;
  total_dex_vol_24h?: number | string;
}

interface SolscanTokenHolderItem {
  address?: string;
  owner?: string;
  amount?: number | string;
  value?: number | string;
  rank?: number | string;
}

interface SolscanTokenHolders {
  total?: number | string;
  items?: SolscanTokenHolderItem[];
}

interface SolscanTokenMarketItem {
  pool_id?: string;
  program_id?: string;
  program_name?: string;
  token_1?: string;
  token_2?: string;
  total_trades_24h?: number | string;
  total_volume_24h?: number | string;
  total_tvl?: number | string;
  price?: number | string;
}

interface SolscanTokenTransferItem {
  trans_id?: string;
  block_time?: number | string;
  activity_type?: string;
  from_address?: string;
  to_address?: string;
  amount?: number | string;
  token_decimals?: number | string;
}

interface SolscanAccountDetail {
  account?: string;
  lamports?: number | string;
  type?: string;
  executable?: boolean | number | string;
  owner_program?: string;
  rent_epoch?: number | string;
  is_oncurve?: boolean | number | string;
}

export interface SolscanTokenIntel {
  address: string;
  name: string | null;
  symbol: string | null;
  iconUrl: string | null;
  decimals: number | null;
  priceUsd: number | null;
  priceChange24hPct: number | null;
  volume24hUsd: number | null;
  dexVolume24hUsd: number | null;
  marketCapUsd: number | null;
  supply: number | null;
  holderCount: number | null;
  creator: string | null;
  createdTimeMs: number | null;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  topHolders: ChainIntelHolder[];
  markets: ChainIntelMarket[];
  recentActivity: ChainIntelActivity[];
}

export interface SolscanAccountIntel {
  address: string;
  lamports: number | null;
  solBalance: number | null;
  type: string | null;
  executable: boolean | null;
  ownerProgram: string | null;
  rentEpoch: number | null;
  isOnCurve: boolean | null;
}

function apiKey(): string {
  return env.SOLSCAN_API_KEY ?? '';
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

function toBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    if (value === 'true' || value === '1') return true;
    if (value === 'false' || value === '0') return false;
  }
  return null;
}

function toTimestampMs(value: unknown): number | null {
  const numeric = toNumber(value);
  if (numeric == null) return null;
  return numeric >= 1_000_000_000_000 ? Math.round(numeric) : Math.round(numeric * 1000);
}

function normalizeTransferAmount(value: unknown, decimals: unknown): number | null {
  const amount = toNumber(value);
  const places = toNumber(decimals);
  if (amount == null) return null;
  if (places == null || !Number.isInteger(places) || places < 0 || places > 18) return amount;
  return amount / 10 ** places;
}

function shortAddress(address: string | null): string | null {
  if (!address) return null;
  if (address.length <= 12) return address;
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

async function solscanFetch<T>(path: string, params?: URLSearchParams): Promise<T | null> {
  const key = apiKey();
  if (!isUsableApiKey(key)) return null;

  const query = params?.toString() ?? '';
  const cacheKey = `solscan:${path}:${query}`;
  const cached = getCached<T>(cacheKey);
  if (cached) return cached;

  const url = query ? `${BASE_URL}${path}?${query}` : `${BASE_URL}${path}`;

  try {
    const res = await fetch(url, {
      headers: {
        accept: 'application/json',
        token: key,
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      console.error(`[Solscan] ${path}: ${res.status} ${res.statusText}`);
      return null;
    }

    const json = (await res.json()) as SolscanEnvelope<T>;
    if (!json.success || json.data == null) return null;

    setCache(cacheKey, json.data, CACHE_TTL_MS);
    return json.data;
  } catch (error) {
    console.error('[Solscan] fetch error:', error);
    return null;
  }
}

function mapHolder(item: SolscanTokenHolderItem, supply: number | null): ChainIntelHolder | null {
  const address = toStringValue(item.address);
  if (!address) return null;

  const amount = toNumber(item.amount);
  const sharePct = amount != null && supply != null && supply > 0
    ? (amount / supply) * 100
    : null;

  return {
    address,
    owner: toStringValue(item.owner),
    amount,
    valueUsd: toNumber(item.value),
    rank: toNumber(item.rank),
    sharePct,
  };
}

function mapMarket(item: SolscanTokenMarketItem, tokenAddress: string): ChainIntelMarket | null {
  const venue = toStringValue(item.program_name) ?? toStringValue(item.program_id);
  if (!venue) return null;

  const token1 = toStringValue(item.token_1);
  const token2 = toStringValue(item.token_2);
  const pairToken = token1 === tokenAddress ? token2 : token1;

  return {
    venue,
    pair: pairToken ? `${shortAddress(tokenAddress)}/${shortAddress(pairToken)}` : null,
    volume24hUsd: toNumber(item.total_volume_24h),
    tvlUsd: toNumber(item.total_tvl),
    tradeCount24h: toNumber(item.total_trades_24h),
    priceUsd: toNumber(item.price),
  };
}

function mapActivity(item: SolscanTokenTransferItem, symbol: string | null): ChainIntelActivity | null {
  const id = toStringValue(item.trans_id);
  if (!id) return null;

  return {
    id,
    timestampMs: toTimestampMs(item.block_time),
    direction: 'unknown',
    from: toStringValue(item.from_address),
    to: toStringValue(item.to_address),
    amount: normalizeTransferAmount(item.amount, item.token_decimals),
    symbol,
    note: toStringValue(item.activity_type),
  };
}

export function hasSolscanKey(): boolean {
  return isUsableApiKey(apiKey());
}

export async function fetchSolscanTokenIntel(address: string): Promise<SolscanTokenIntel | null> {
  const [meta, holders, markets, transfers] = await Promise.all([
    solscanFetch<SolscanTokenMeta>('/token/meta', new URLSearchParams({ address })),
    solscanFetch<SolscanTokenHolders>('/token/holders', new URLSearchParams({ address, page: '1', page_size: '10' })),
    (() => {
      const params = new URLSearchParams({ sort_by: 'volume', page: '1', page_size: '10' });
      params.append('token', address);
      return solscanFetch<SolscanTokenMarketItem[]>('/token/markets', params);
    })(),
    solscanFetch<SolscanTokenTransferItem[]>(
      '/token/transfer',
      new URLSearchParams({
        address,
        page: '1',
        page_size: '10',
        sort_by: 'block_time',
        sort_order: 'desc',
      }),
    ),
  ]);

  if (!meta && !holders && !markets && !transfers) return null;

  const supply = toNumber(meta?.supply);
  const symbol = toStringValue(meta?.symbol);

  return {
    address,
    name: toStringValue(meta?.name),
    symbol,
    iconUrl: toStringValue(meta?.icon),
    decimals: toNumber(meta?.decimals),
    priceUsd: toNumber(meta?.price),
    priceChange24hPct: toNumber(meta?.price_change_24h),
    volume24hUsd: toNumber(meta?.volume_24h),
    dexVolume24hUsd: toNumber(meta?.total_dex_vol_24h),
    marketCapUsd: toNumber(meta?.market_cap),
    supply,
    holderCount: toNumber(meta?.holder) ?? toNumber(holders?.total),
    creator: toStringValue(meta?.creator),
    createdTimeMs: toTimestampMs(meta?.created_time),
    mintAuthority: toStringValue(meta?.mint_authority),
    freezeAuthority: toStringValue(meta?.freeze_authority),
    topHolders: (holders?.items ?? [])
      .map((item) => mapHolder(item, supply))
      .filter((item): item is ChainIntelHolder => item != null),
    markets: (markets ?? [])
      .map((item) => mapMarket(item, address))
      .filter((item): item is ChainIntelMarket => item != null),
    recentActivity: (transfers ?? [])
      .map((item) => mapActivity(item, symbol))
      .filter((item): item is ChainIntelActivity => item != null),
  };
}

export async function fetchSolscanAccountIntel(address: string): Promise<SolscanAccountIntel | null> {
  const detail = await solscanFetch<SolscanAccountDetail>('/account/detail', new URLSearchParams({ address }));
  if (!detail) return null;

  const lamports = toNumber(detail.lamports);

  return {
    address: toStringValue(detail.account) ?? address,
    lamports,
    solBalance: lamports != null ? lamports / LAMPORTS_PER_SOL : null,
    type: toStringValue(detail.type),
    executable: toBoolean(detail.executable),
    ownerProgram: toStringValue(detail.owner_program),
    rentEpoch: toNumber(detail.rent_epoch),
    isOnCurve: toBoolean(detail.is_oncurve),
  };
}

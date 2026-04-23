import { env } from '$env/dynamic/private';
import type { ChainIntelActivity, ChainIntelMarket } from '$lib/contracts/chainIntel';
import { getCached, setCache } from '$lib/server/providers/cache';

const DEMO_BASE_URL = 'https://api.coingecko.com/api/v3';
const PRO_BASE_URL = 'https://pro-api.coingecko.com/api/v3';
const NETWORK_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const TOKEN_CACHE_TTL_MS = 60_000;
const AUTH_MODE_CACHE_KEY = 'coingecko:onchain:auth-mode';
const AUTH_MODE_CACHE_TTL_MS = 60 * 60 * 1000;
const PLACEHOLDER_HINTS = ['your_', 'your-', 'placeholder', 'changeme', 'example', 'dummy', '<'];

type CoinGeckoApiMode = 'demo' | 'pro';

interface CoinGeckoAssetPlatform {
  id?: string;
  chain_identifier?: number | string | null;
  name?: string;
  shortname?: string;
}

interface CoinGeckoNetworkEnvelope {
  data?: CoinGeckoNetworkRow[];
}

interface CoinGeckoNetworkRow {
  id?: string;
  type?: string;
  attributes?: {
    name?: string;
    coingecko_asset_platform_id?: string;
  };
}

interface CoinGeckoTokenEnvelope {
  data?: CoinGeckoTokenRow | null;
}

interface CoinGeckoTokenRow {
  id?: string;
  type?: string;
  attributes?: {
    address?: string;
    name?: string;
    symbol?: string;
    image_url?: string;
    decimals?: number | string;
    price_usd?: number | string;
    market_cap_usd?: number | string;
    fdv_usd?: number | string;
    total_reserve_in_usd?: number | string;
    volume_usd?: {
      h24?: number | string;
    };
  };
}

interface CoinGeckoPoolEnvelope {
  data?: CoinGeckoPoolRow[];
  included?: CoinGeckoIncludedRow[];
}

interface CoinGeckoPoolRow {
  id?: string;
  type?: string;
  attributes?: {
    address?: string;
    name?: string;
    reserve_in_usd?: number | string;
    base_token_price_usd?: number | string;
    quote_token_price_usd?: number | string;
    volume_usd?: {
      h24?: number | string;
    };
    transactions?: {
      h24?: {
        buys?: number | string;
        sells?: number | string;
      };
    };
    price_change_percentage?: {
      h24?: number | string;
    };
  };
  relationships?: {
    dex?: {
      data?: {
        id?: string;
      } | null;
    };
  };
}

interface CoinGeckoIncludedRow {
  id?: string;
  type?: string;
  attributes?: {
    name?: string;
  };
}

interface CoinGeckoTradeEnvelope {
  data?: CoinGeckoTradeRow[];
}

interface CoinGeckoTradeRow {
  id?: string;
  type?: string;
  attributes?: {
    tx_hash?: string;
    tx_from_address?: string;
    pool_address?: string;
    pool_name?: string;
    pool_dex?: string;
    block_timestamp?: string | number;
    kind?: 'buy' | 'sell' | string;
    volume_in_usd?: string | number;
    from_token_amount?: string | number;
    to_token_amount?: string | number;
    from_token_address?: string;
    to_token_address?: string;
  };
}

interface CoinGeckoResolvedNetwork {
  id: string;
  name: string | null;
  assetPlatformId: string | null;
}

interface ResolveCoinGeckoOnchainNetworkArgs {
  chain: string;
  chainId: string | null;
  chainLabel: string;
  aliases?: string[];
}

export interface FetchCoinGeckoOnchainTokenIntelArgs extends ResolveCoinGeckoOnchainNetworkArgs {
  address: string;
}

export interface CoinGeckoOnchainTokenIntel {
  networkId: string;
  networkLabel: string | null;
  assetPlatformId: string | null;
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
  markets: ChainIntelMarket[];
  recentActivity: ChainIntelActivity[];
  tokenLoaded: boolean;
  poolsLoaded: boolean;
  tradesLoaded: boolean;
}

function apiKey(): string {
  return env.COINGECKO_API_KEY ?? '';
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
  if (numeric != null) {
    return numeric >= 1_000_000_000_000 ? Math.round(numeric) : Math.round(numeric * 1000);
  }
  const iso = toStringValue(value);
  if (!iso) return null;
  const timestamp = Date.parse(iso);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function humanizeId(value: string | null): string | null {
  if (!value) return null;
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function getApiModes(): CoinGeckoApiMode[] {
  const cached = getCached<CoinGeckoApiMode>(AUTH_MODE_CACHE_KEY);
  if (cached === 'pro') return ['pro', 'demo'];
  if (cached === 'demo') return ['demo', 'pro'];
  return ['demo', 'pro'];
}

function baseUrl(mode: CoinGeckoApiMode): string {
  return mode === 'pro' ? PRO_BASE_URL : DEMO_BASE_URL;
}

function headerName(mode: CoinGeckoApiMode): string {
  return mode === 'pro' ? 'x-cg-pro-api-key' : 'x-cg-demo-api-key';
}

async function coingeckoFetchJson<T>(
  cacheKey: string,
  path: string,
  params?: URLSearchParams,
  ttlMs = TOKEN_CACHE_TTL_MS,
): Promise<T | null> {
  const key = apiKey();
  if (!isUsableApiKey(key)) return null;

  const cached = getCached<T>(cacheKey);
  if (cached) return cached;

  const query = params?.toString();
  const suffix = query ? `${path}?${query}` : path;

  for (const mode of getApiModes()) {
    try {
      const res = await fetch(`${baseUrl(mode)}${suffix}`, {
        headers: {
          accept: 'application/json',
          [headerName(mode)]: key,
        },
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        if (res.status === 401 || res.status === 402 || res.status === 403) {
          continue;
        }
        console.error(`[CoinGeckoOnchain] ${path}: ${res.status} ${res.statusText}`);
        return null;
      }

      const json = (await res.json()) as T;
      setCache(cacheKey, json, ttlMs);
      setCache(AUTH_MODE_CACHE_KEY, mode, AUTH_MODE_CACHE_TTL_MS);
      return json;
    } catch (error) {
      console.error('[CoinGeckoOnchain] fetch error:', error);
      return null;
    }
  }

  return null;
}

async function fetchAssetPlatforms(): Promise<CoinGeckoAssetPlatform[] | null> {
  return coingeckoFetchJson<CoinGeckoAssetPlatform[]>(
    'coingecko:onchain:asset-platforms',
    '/asset_platforms',
    undefined,
    NETWORK_CACHE_TTL_MS,
  );
}

async function fetchOnchainNetworks(): Promise<CoinGeckoResolvedNetwork[] | null> {
  const cached = getCached<CoinGeckoResolvedNetwork[]>('coingecko:onchain:networks');
  if (cached) return cached;

  const rows: CoinGeckoResolvedNetwork[] = [];
  for (let page = 1; page <= 10; page += 1) {
    const payload = await coingeckoFetchJson<CoinGeckoNetworkEnvelope>(
      `coingecko:onchain:networks:${page}`,
      '/onchain/networks',
      new URLSearchParams({ page: String(page) }),
      NETWORK_CACHE_TTL_MS,
    );
    const data = payload?.data ?? [];
    if (data.length === 0) break;

    rows.push(
      ...data
        .map((item) => {
          const id = toStringValue(item.id);
          if (!id) return null;
          return {
            id,
            name: toStringValue(item.attributes?.name),
            assetPlatformId: toStringValue(item.attributes?.coingecko_asset_platform_id),
          };
        })
        .filter((item): item is CoinGeckoResolvedNetwork => item != null),
    );

    if (data.length < 20) break;
  }

  if (rows.length === 0) return null;
  setCache('coingecko:onchain:networks', rows, NETWORK_CACHE_TTL_MS);
  return rows;
}

async function resolveCoinGeckoOnchainNetwork(
  args: ResolveCoinGeckoOnchainNetworkArgs,
): Promise<CoinGeckoResolvedNetwork | null> {
  const [assetPlatforms, networks] = await Promise.all([
    fetchAssetPlatforms(),
    fetchOnchainNetworks(),
  ]);
  if (!assetPlatforms || !networks) return null;

  const chainIdNumber = toNumber(args.chainId);
  const aliases = new Set(
    [args.chain, args.chainLabel, ...(args.aliases ?? []), args.chainId ?? '']
      .filter(Boolean)
      .map((value) => normalizeKey(String(value))),
  );

  const platformByChainId = chainIdNumber == null
    ? null
    : assetPlatforms.find((platform) => toNumber(platform.chain_identifier) === chainIdNumber) ?? null;

  const platform = platformByChainId
    ?? assetPlatforms.find((candidate) => {
      const keys = [
        toStringValue(candidate.id),
        toStringValue(candidate.name),
        toStringValue(candidate.shortname),
      ]
        .filter((value): value is string => value != null)
        .map(normalizeKey);
      return keys.some((key) => aliases.has(key));
    })
    ?? null;

  if (platform?.id) {
    const joined = networks.find((network) => normalizeKey(network.assetPlatformId ?? '') === normalizeKey(platform.id ?? ''));
    if (joined) return joined;
  }

  return networks.find((network) => {
    const keys = [
      network.id,
      network.name ?? '',
      network.assetPlatformId ?? '',
    ].map(normalizeKey);
    return keys.some((key) => aliases.has(key));
  }) ?? null;
}

interface MappedPool {
  market: ChainIntelMarket;
  priceChange24hPct: number | null;
  liquidityUsd: number | null;
}

function mapPools(
  rows: CoinGeckoPoolRow[],
  included: CoinGeckoIncludedRow[] | undefined,
  fallbackPriceUsd: number | null,
): MappedPool[] {
  const dexNames = new Map<string, string>();
  for (const item of included ?? []) {
    const id = toStringValue(item.id);
    if (!id || item.type !== 'dex') continue;
    const name = toStringValue(item.attributes?.name);
    if (name) dexNames.set(id, name);
  }

  return rows
    .map((item) => {
      const dexId = toStringValue(item.relationships?.dex?.data?.id);
      const dexName = dexId ? dexNames.get(dexId) ?? humanizeId(dexId) : null;
      const trades = item.attributes?.transactions?.h24;
      const buys = toNumber(trades?.buys) ?? 0;
      const sells = toNumber(trades?.sells) ?? 0;
      const liquidityUsd = toNumber(item.attributes?.reserve_in_usd);

      return {
        market: {
          venue: dexName ?? 'DEX',
          pair: toStringValue(item.attributes?.name),
          volume24hUsd: toNumber(item.attributes?.volume_usd?.h24),
          tvlUsd: liquidityUsd,
          tradeCount24h: buys + sells,
          priceUsd: fallbackPriceUsd ?? toNumber(item.attributes?.base_token_price_usd) ?? toNumber(item.attributes?.quote_token_price_usd),
        },
        priceChange24hPct: toNumber(item.attributes?.price_change_percentage?.h24),
        liquidityUsd,
      };
    })
    .filter((item) => item.market.pair || item.market.volume24hUsd != null || item.market.tvlUsd != null);
}

function mapTrades(rows: CoinGeckoTradeRow[], tokenAddress: string, symbol: string | null): ChainIntelActivity[] {
  const normalizedToken = tokenAddress.toLowerCase();

  return rows
    .map((item): ChainIntelActivity | null => {
      const attrs = item.attributes;
      if (!attrs) return null;

      const id = toStringValue(attrs.tx_hash) ?? toStringValue(item.id);
      if (!id) return null;

      const fromToken = toStringValue(attrs.from_token_address)?.toLowerCase() ?? null;
      const toToken = toStringValue(attrs.to_token_address)?.toLowerCase() ?? null;
      const direction = fromToken === normalizedToken
        ? 'out'
        : toToken === normalizedToken
          ? 'in'
          : attrs.kind === 'buy'
            ? 'in'
            : attrs.kind === 'sell'
              ? 'out'
              : 'unknown';

      const amount = direction === 'out'
        ? toNumber(attrs.from_token_amount)
        : direction === 'in'
          ? toNumber(attrs.to_token_amount)
          : toNumber(attrs.volume_in_usd);

      const venue = toStringValue(attrs.pool_dex) ?? 'dex';
      const pool = toStringValue(attrs.pool_name) ?? toStringValue(attrs.pool_address);

      return {
        id,
        timestampMs: toTimestampMs(attrs.block_timestamp),
        direction,
        from: toStringValue(attrs.tx_from_address),
        to: pool,
        amount,
        symbol,
        note: [toStringValue(attrs.kind), venue, pool].filter(Boolean).join(' · ') || null,
      };
    })
    .filter((item): item is ChainIntelActivity => item !== null);
}

export function hasCoinGeckoApiKey(): boolean {
  return isUsableApiKey(apiKey());
}

export async function fetchCoinGeckoOnchainTokenIntel(
  args: FetchCoinGeckoOnchainTokenIntelArgs,
): Promise<CoinGeckoOnchainTokenIntel | null> {
  if (!hasCoinGeckoApiKey()) return null;

  const network = await resolveCoinGeckoOnchainNetwork(args);
  if (!network) return null;

  const encodedNetwork = encodeURIComponent(network.id);
  const encodedAddress = encodeURIComponent(args.address);

  const [tokenPayload, poolsPayload] = await Promise.all([
    coingeckoFetchJson<CoinGeckoTokenEnvelope>(
      `coingecko:onchain:token:${network.id}:${args.address.toLowerCase()}`,
      `/onchain/networks/${encodedNetwork}/tokens/${encodedAddress}`,
    ),
    coingeckoFetchJson<CoinGeckoPoolEnvelope>(
      `coingecko:onchain:pools:${network.id}:${args.address.toLowerCase()}`,
      `/onchain/networks/${encodedNetwork}/tokens/${encodedAddress}/pools`,
      new URLSearchParams({ page: '1' }),
    ),
  ]);

  const token = tokenPayload?.data ?? null;
  const tokenLoaded = token != null;
  const poolsLoaded = Array.isArray(poolsPayload?.data);
  const topPoolAddress = toStringValue(poolsPayload?.data?.[0]?.attributes?.address)
    ?? toStringValue(poolsPayload?.data?.[0]?.id);
  const encodedPoolAddress = topPoolAddress ? encodeURIComponent(topPoolAddress) : null;
  const tradesPayload = encodedPoolAddress
    ? await coingeckoFetchJson<CoinGeckoTradeEnvelope>(
        `coingecko:onchain:trades:${network.id}:${encodedPoolAddress}`,
        `/onchain/networks/${encodedNetwork}/pools/${encodedPoolAddress}/trades`,
        new URLSearchParams({ page: '1' }),
      )
    : null;
  const tradesLoaded = Array.isArray(tradesPayload?.data);

  if (!tokenLoaded && !poolsLoaded && !tradesLoaded) return null;

  const priceUsd = toNumber(token?.attributes?.price_usd);
  const mappedPools = mapPools(poolsPayload?.data ?? [], poolsPayload?.included, priceUsd);
  const markets = mappedPools.slice(0, 5).map((item) => item.market);
  const recentActivity = mapTrades(tradesPayload?.data ?? [], args.address, toStringValue(token?.attributes?.symbol));

  return {
    networkId: network.id,
    networkLabel: network.name,
    assetPlatformId: network.assetPlatformId,
    name: toStringValue(token?.attributes?.name),
    symbol: toStringValue(token?.attributes?.symbol),
    iconUrl: toStringValue(token?.attributes?.image_url),
    decimals: toNumber(token?.attributes?.decimals),
    priceUsd,
    priceChange24hPct: mappedPools[0]?.priceChange24hPct ?? null,
    marketCapUsd: toNumber(token?.attributes?.market_cap_usd),
    fdvUsd: toNumber(token?.attributes?.fdv_usd),
    liquidityUsd: toNumber(token?.attributes?.total_reserve_in_usd) ?? mappedPools[0]?.liquidityUsd ?? null,
    dexVolume24hUsd: toNumber(token?.attributes?.volume_usd?.h24) ?? markets[0]?.volume24hUsd ?? null,
    markets,
    recentActivity: recentActivity.slice(0, 20),
    tokenLoaded,
    poolsLoaded,
    tradesLoaded,
  };
}

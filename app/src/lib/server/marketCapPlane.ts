import { fetchAsset, fetchHistory } from '$lib/api/coincap';
import type {
  MarketCapHistoryPoint,
  MarketCapOverview,
  MarketCapProviderState,
} from '$lib/contracts/marketCapPlane';
import { fetchDefiLlamaStableMcap } from '$lib/server/defillama';
import { getCached, setCache } from '$lib/server/providers/cache';
import { fetchCoinGeckoGlobal, fetchStablecoinMcap } from '$lib/server/providers/coingecko';

const OVERVIEW_CACHE_TTL_MS = 60_000;
const BTC_HISTORY_CACHE_TTL_MS = 30 * 60_000;
const DAY_MS = 86_400_000;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function toProviderState(
  provider: string,
  status: MarketCapProviderState['status'],
  detail?: string,
  updatedAt?: number | null,
): MarketCapProviderState {
  return {
    provider,
    status,
    detail,
    updatedAt: updatedAt ?? null,
  };
}

function deriveDominance(assetMarketCapUsd: number | null, totalMarketCapUsd: number | null): number | null {
  if (!isFiniteNumber(assetMarketCapUsd) || !isFiniteNumber(totalMarketCapUsd) || totalMarketCapUsd <= 0) {
    return null;
  }
  return (assetMarketCapUsd / totalMarketCapUsd) * 100;
}

function restorePreviousValue(current: number | null, changePct: number | null): number | null {
  if (!isFiniteNumber(current) || !isFiniteNumber(changePct)) return null;
  const denominator = 1 + changePct / 100;
  if (!Number.isFinite(denominator) || Math.abs(denominator) < 1e-9) return null;
  return current / denominator;
}

function deriveDominanceChange24h(args: {
  assetMarketCapUsd: number | null;
  totalMarketCapUsd: number | null;
  assetChange24hPct: number | null;
  totalChange24hPct: number | null;
}): number | null {
  const prevAsset = restorePreviousValue(args.assetMarketCapUsd, args.assetChange24hPct);
  const prevTotal = restorePreviousValue(args.totalMarketCapUsd, args.totalChange24hPct);
  const prevDominance = deriveDominance(prevAsset, prevTotal);
  const currentDominance = deriveDominance(args.assetMarketCapUsd, args.totalMarketCapUsd);
  if (!isFiniteNumber(prevDominance) || !isFiniteNumber(currentDominance)) return null;
  return currentDominance - prevDominance;
}

function relativeSpreadPct(values: Array<number | null | undefined>): number | null {
  const finite = values.filter(isFiniteNumber);
  if (finite.length < 2) return null;
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const mid = (min + max) / 2;
  if (mid <= 0) return null;
  return ((max - min) / mid) * 100;
}

function maxFinite(values: Array<number | null | undefined>): number | null {
  const finite = values.filter(isFiniteNumber);
  if (!finite.length) return null;
  return Math.max(...finite);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function deriveConfidence(args: {
  hasGlobal: boolean;
  hasBtcAsset: boolean;
  hasEthAsset: boolean;
  hasStablePrimary: boolean;
  hasStableFallback: boolean;
  sourceSpreadPct: number | null;
}): number {
  let score = 0.2;
  if (args.hasGlobal) score += 0.3;
  if (args.hasBtcAsset) score += 0.15;
  if (args.hasEthAsset) score += 0.1;
  if (args.hasStablePrimary) score += 0.2;
  else if (args.hasStableFallback) score += 0.1;

  if (isFiniteNumber(args.sourceSpreadPct)) {
    if (args.sourceSpreadPct <= 1) score += 0.15;
    else if (args.sourceSpreadPct <= 3) score += 0.1;
    else if (args.sourceSpreadPct <= 5) score += 0.05;
  }

  return Number(clamp01(score).toFixed(2));
}

export async function fetchMarketCapOverview(): Promise<MarketCapOverview> {
  const cacheKey = 'marketcap:overview:v1';
  const cached = getCached<MarketCapOverview>(cacheKey);
  if (cached) return cached;

  const [geckoGlobal, geckoStable, llamaStable, btcAsset, ethAsset] = await Promise.all([
    fetchCoinGeckoGlobal(),
    fetchStablecoinMcap(),
    fetchDefiLlamaStableMcap(),
    fetchAsset('bitcoin'),
    fetchAsset('ethereum'),
  ]);

  const totalMarketCapUsd = geckoGlobal?.totalMarketCapUsd ?? null;
  const marketCapChange24hPct = geckoGlobal?.marketCapChange24hPct ?? null;

  const btcMarketCapUsd =
    btcAsset?.marketCapUsd ??
    (isFiniteNumber(totalMarketCapUsd) && isFiniteNumber(geckoGlobal?.btcDominance)
      ? totalMarketCapUsd * (geckoGlobal.btcDominance / 100)
      : null);
  const ethMarketCapUsd =
    ethAsset?.marketCapUsd ??
    (isFiniteNumber(totalMarketCapUsd) && isFiniteNumber(geckoGlobal?.ethDominance)
      ? totalMarketCapUsd * (geckoGlobal.ethDominance / 100)
      : null);

  const derivedBtcDominance = deriveDominance(btcMarketCapUsd, totalMarketCapUsd);
  const derivedEthDominance = deriveDominance(ethMarketCapUsd, totalMarketCapUsd);
  const btcDominance = derivedBtcDominance ?? geckoGlobal?.btcDominance ?? null;
  const ethDominance = derivedEthDominance ?? geckoGlobal?.ethDominance ?? null;
  const dominanceChange24h =
    deriveDominanceChange24h({
      assetMarketCapUsd: btcMarketCapUsd,
      totalMarketCapUsd,
      assetChange24hPct: btcAsset?.changePercent24Hr ?? null,
      totalChange24hPct: marketCapChange24hPct,
    }) ?? null;

  const stablecoinMcapUsd = llamaStable?.totalMcapUsd ?? geckoStable?.totalMcapUsd ?? null;
  const stablecoinMcapChange24hPct = llamaStable?.change24hPct ?? geckoStable?.change24hPct ?? null;
  const stablecoinMcapChange7dPct = llamaStable?.change7dPct ?? null;

  const sourceSpreadPct = maxFinite([
    relativeSpreadPct([derivedBtcDominance, geckoGlobal?.btcDominance]),
    relativeSpreadPct([llamaStable?.totalMcapUsd, geckoStable?.totalMcapUsd]),
  ]);

  const payload: MarketCapOverview = {
    at: Date.now(),
    totalMarketCapUsd,
    marketCapChange24hPct,
    btcMarketCapUsd,
    ethMarketCapUsd,
    btcDominance,
    ethDominance,
    dominanceChange24h,
    stablecoinMcapUsd,
    stablecoinMcapChange24hPct,
    stablecoinMcapChange7dPct,
    sourceSpreadPct,
    confidence: deriveConfidence({
      hasGlobal: Boolean(geckoGlobal),
      hasBtcAsset: Boolean(btcAsset),
      hasEthAsset: Boolean(ethAsset),
      hasStablePrimary: Boolean(llamaStable),
      hasStableFallback: Boolean(geckoStable),
      sourceSpreadPct,
    }),
    providers: {
      global: geckoGlobal
        ? toProviderState('coingecko', 'live', 'Global total market cap still comes from CoinGecko.', geckoGlobal.updatedAt)
        : toProviderState('coingecko', 'blocked', 'CoinGecko global market cap unavailable.', null),
      assets:
        btcAsset && ethAsset
          ? toProviderState(
              'coincap',
              'live',
              'BTC and ETH market caps come from CoinCap asset snapshots.',
              Date.now(),
            )
          : btcAsset || ethAsset
            ? toProviderState(
                'coincap',
                'partial',
                'One or more asset market-cap snapshots are missing from CoinCap.',
                Date.now(),
              )
            : toProviderState('coincap', 'blocked', 'CoinCap asset market-cap snapshots unavailable.', null),
      stablecoins: llamaStable
        ? toProviderState(
            'defillama',
            'live',
            'Stablecoin market cap uses DefiLlama as primary source.',
            llamaStable.updatedAt,
          )
        : geckoStable
          ? toProviderState(
              'coingecko',
              'partial',
              'DefiLlama unavailable; using CoinGecko stablecoin basket fallback.',
              geckoStable.updatedAt,
            )
          : toProviderState('defillama', 'blocked', 'Stablecoin market-cap sources unavailable.', null),
    },
  };

  setCache(cacheKey, payload, OVERVIEW_CACHE_TTL_MS);
  return payload;
}

export async function fetchApproxBtcMarketCapHistory(days = 180): Promise<MarketCapHistoryPoint[]> {
  const safeDays = Math.max(30, Math.min(365, Math.round(days)));
  const cacheKey = `marketcap:btc-history-approx:${safeDays}`;
  const cached = getCached<MarketCapHistoryPoint[]>(cacheKey);
  if (cached) return cached;

  const end = Date.now();
  const start = end - (safeDays + 14) * DAY_MS;
  const [btcHistory, btcAsset] = await Promise.all([
    fetchHistory('bitcoin', 'd1', start, end),
    fetchAsset('bitcoin'),
  ]);

  if (!btcAsset?.supply || !btcHistory.length) {
    return [];
  }

  const points = btcHistory
    .filter((row) => isFiniteNumber(row.time) && isFiniteNumber(row.priceUsd) && row.priceUsd > 0)
    .slice(-safeDays)
    .map((row) => ({
      timestampMs: row.time,
      marketCapUsd: row.priceUsd * btcAsset.supply,
    }));

  setCache(cacheKey, points, BTC_HISTORY_CACHE_TTL_MS);
  return points;
}

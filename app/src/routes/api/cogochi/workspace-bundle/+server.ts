import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import type { AnalyzeEnvelope } from '$lib/contracts/terminalBackend';
import type { ChartSeriesPayload, CogochiWorkspaceBundleResult } from '$lib/api/terminalBackend';
import type { ConfluenceResult } from '$lib/confluence/types';
import type {
  DexOverviewPayload,
  OnchainBackdropPayload,
} from '$lib/contracts/cogochiDataPlane';
import type {
  LiqClusterPayload,
  OptionsSnapshotPayload,
  FundingFlipPayload,
  IndicatorContextPayload,
  RvConePayload,
  SsrPayload,
  VenueDivergencePayload,
} from '$lib/indicators/adapter';
import { buildCogochiWorkspaceEnvelope } from '$lib/cogochi/workspaceDataPlane';

async function readJson<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function fetchRoute<T>(fetchImpl: typeof fetch, path: string): Promise<T | null> {
  try {
    const res = await fetchImpl(path);
    if (!res.ok) return null;
    return await readJson<T>(res);
  } catch {
    return null;
  }
}

function symbolToOptionsCurrency(symbol: string): string | null {
  if (symbol.startsWith('BTC')) return 'BTC';
  if (symbol.startsWith('ETH')) return 'ETH';
  return null;
}

function symbolToOnchainAsset(symbol: string): 'btc' | 'eth' | null {
  if (symbol.startsWith('BTC')) return 'btc';
  if (symbol.startsWith('ETH')) return 'eth';
  return null;
}

interface OnchainRoutePayload {
  ok?: boolean;
  source?: 'coinmetrics' | 'cryptoquant';
  data?: {
    updatedAt?: number;
    exchangeReserve?: {
      netflow24h?: number | null;
      change7dPct?: number | null;
    } | null;
    onchainMetrics?: {
      mvrv?: number | null;
      nupl?: number | null;
      sopr?: number | null;
      puellMultiple?: number | null;
    } | null;
    whaleData?: {
      whaleCount?: number | null;
      whaleNetflow?: number | null;
      exchangeWhaleRatio?: number | null;
    } | null;
  } | null;
}

export const GET = async ({ url, fetch }: RequestEvent) => {
  const symbol = (url.searchParams.get('symbol') ?? 'BTCUSDT').toUpperCase();
  const tf = url.searchParams.get('tf') ?? '4h';
  const includeChart = url.searchParams.get('includeChart') !== '0';
  const currency = symbolToOptionsCurrency(symbol);
  const onchainAsset = symbolToOnchainAsset(symbol);

  const [
    analyze,
    chartPayload,
    confluence,
    venueDivergence,
    liqClusters,
    optionsSnapshot,
    indicatorContext,
    ssr,
    rvCone,
    fundingFlip,
    onchainResponse,
    dexOverview,
  ] = await Promise.all([
    fetchRoute<AnalyzeEnvelope>(fetch, `/api/cogochi/analyze?symbol=${symbol}&tf=${tf}`),
    includeChart
      ? fetchRoute<ChartSeriesPayload>(fetch, `/api/chart/klines?symbol=${symbol}&tf=${tf}&limit=500`)
      : Promise.resolve(null),
    fetchRoute<ConfluenceResult>(fetch, `/api/confluence/current?symbol=${symbol}&tf=${tf}`),
    fetchRoute<VenueDivergencePayload>(fetch, `/api/market/venue-divergence?symbol=${symbol}`),
    fetchRoute<LiqClusterPayload>(fetch, `/api/market/liq-clusters?symbol=${symbol}&window=4h`),
    currency
      ? fetchRoute<OptionsSnapshotPayload>(fetch, `/api/market/options-snapshot?currency=${currency}`)
      : Promise.resolve(null),
    fetchRoute<IndicatorContextPayload>(fetch, `/api/market/indicator-context?symbol=${symbol}`),
    fetchRoute<SsrPayload>(fetch, `/api/market/stablecoin-ssr`),
    fetchRoute<RvConePayload>(fetch, `/api/market/rv-cone?symbol=${symbol}`),
    fetchRoute<FundingFlipPayload>(fetch, `/api/market/funding-flip?symbol=${symbol}`),
    onchainAsset
      ? fetchRoute<OnchainRoutePayload>(fetch, `/api/onchain/cryptoquant?token=${onchainAsset}`)
      : Promise.resolve(null),
    fetchRoute<DexOverviewPayload>(fetch, `/api/market/dex/overview?symbol=${symbol}`),
  ]);

  const onchainBackdrop: OnchainBackdropPayload | null =
    onchainResponse?.ok && onchainResponse.data
      ? {
          source: onchainResponse.source ?? 'none',
          asset: onchainAsset ?? 'btc',
          at: onchainResponse.data.updatedAt ?? Date.now(),
          exchangeReserve: onchainResponse.data.exchangeReserve
            ? {
                netflow24h: onchainResponse.data.exchangeReserve.netflow24h ?? null,
                change7dPct: onchainResponse.data.exchangeReserve.change7dPct ?? null,
              }
            : null,
          metrics: onchainResponse.data.onchainMetrics
            ? {
                mvrv: onchainResponse.data.onchainMetrics.mvrv ?? null,
                nupl: onchainResponse.data.onchainMetrics.nupl ?? null,
                sopr: onchainResponse.data.onchainMetrics.sopr ?? null,
                puellMultiple: onchainResponse.data.onchainMetrics.puellMultiple ?? null,
              }
            : null,
          whale: onchainResponse.data.whaleData
            ? {
                whaleCount: onchainResponse.data.whaleData.whaleCount ?? null,
                whaleNetflow: onchainResponse.data.whaleData.whaleNetflow ?? null,
                exchangeWhaleRatio: onchainResponse.data.whaleData.exchangeWhaleRatio ?? null,
                coverage: onchainResponse.source === 'cryptoquant' ? 'cryptoquant' : 'geckoterminal-top-pools',
              }
            : null,
        }
      : null;

  const workspaceEnvelope = buildCogochiWorkspaceEnvelope({
    symbol,
    timeframe: tf,
    analyze,
    chartPayload,
    confluence,
    venueDivergence,
    liqClusters,
    optionsSnapshot,
    indicatorContext,
    ssr,
    rvCone,
    fundingFlip,
    onchainBackdrop,
    dexOverview,
  });

  const payload: CogochiWorkspaceBundleResult = {
    analyze,
    chartPayload,
    confluence,
    venueDivergence,
    liqClusters,
    optionsSnapshot,
    indicatorContext,
    ssr,
    rvCone,
    fundingFlip,
    onchainBackdrop,
    dexOverview,
    workspaceEnvelope,
  };

  return json(payload, {
    headers: {
      'cache-control': includeChart ? 'private, max-age=5' : 'private, max-age=15',
    },
  });
};

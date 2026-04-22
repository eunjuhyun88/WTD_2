import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import type { AnalyzeEnvelope } from '$lib/contracts/terminalBackend';
import type { ChartSeriesPayload, CogochiWorkspaceBundleResult } from '$lib/api/terminalBackend';
import type { ConfluenceResult } from '$lib/confluence/types';
import type {
  LiqClusterPayload,
  OptionsSnapshotPayload,
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

export const GET = async ({ url, fetch }: RequestEvent) => {
  const symbol = (url.searchParams.get('symbol') ?? 'BTCUSDT').toUpperCase();
  const tf = url.searchParams.get('tf') ?? '4h';
  const includeChart = url.searchParams.get('includeChart') !== '0';
  const currency = symbolToOptionsCurrency(symbol);

  const [analyze, chartPayload, confluence, venueDivergence, liqClusters, optionsSnapshot] = await Promise.all([
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
  ]);

  const workspaceEnvelope = buildCogochiWorkspaceEnvelope({
    symbol,
    timeframe: tf,
    analyze,
    chartPayload,
    confluence,
    venueDivergence,
    liqClusters,
    optionsSnapshot,
  });

  const payload: CogochiWorkspaceBundleResult = {
    analyze,
    chartPayload,
    confluence,
    venueDivergence,
    liqClusters,
    optionsSnapshot,
    workspaceEnvelope,
  };

  return json(payload, {
    headers: {
      'cache-control': includeChart ? 'private, max-age=5' : 'private, max-age=15',
    },
  });
};

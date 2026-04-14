import { enrichAnalyzePayload } from '$lib/terminal/backendBridge';
import { fetchTerminalBundle } from '$lib/api/terminalBackend';
import type { AnalyzeEnvelope, DerivativesEnvelope, SnapshotEnvelope } from '$lib/contracts/terminalBackend';

export interface MarketSeriesBar {
  t: number;
  c: number;
  v: number;
  delta: number;
  cvd: number;
}

export type TerminalAnalyzeData = AnalyzeEnvelope & {
  microstructure?: any;
  backendSnapshot?: SnapshotEnvelope | null;
  derivativesSnapshot?: DerivativesEnvelope | null;
  derivatives?: { funding_rate?: number };
  degraded?: boolean;
};

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function safePctChange(current?: number, previous?: number): number {
  if (!current || !previous) return 0;
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return 0;
  return (current - previous) / previous;
}

function buildMarketOnlyEnvelope(
  symbol: string,
  tf: string,
  reason: string,
  marketBars: MarketSeriesBar[],
  oiBars: MarketSeriesBar[],
  fundingBars: MarketSeriesBar[],
): TerminalAnalyzeData {
  const latestBar = marketBars.at(-1);
  const prevBar = marketBars.at(-2);
  const reference24hBar = marketBars.length > 24 ? marketBars.at(-25) : prevBar;
  const recentVolumes = marketBars.slice(-21, -1).map((bar) => bar.v).filter((value) => Number.isFinite(value));
  const volRatio = latestBar?.v && recentVolumes.length > 0 ? latestBar.v / avg(recentVolumes) : 1;
  const latestOi = oiBars.at(-1)?.c;
  const prevOi = oiBars.at(-2)?.c;
  const latestFunding = fundingBars.at(-1)?.c ?? 0;
  const oiChange1h = safePctChange(latestOi, prevOi);
  const change24h = safePctChange(latestBar?.c, reference24hBar?.c) * 100;
  const delta = latestBar?.delta ?? 0;
  const cvdState = delta > 0 ? 'buying' : delta < 0 ? 'selling' : 'balanced';
  const regime = change24h >= 2 ? 'risk_on' : change24h <= -2 ? 'risk_off' : 'balanced';

  return {
    symbol,
    tf,
    mode: 'market-only',
    price: latestBar?.c ?? 0,
    change24h,
    ensemble: {
      direction: 'neutral',
      ensemble_score: 0,
      reason,
      block_analysis: { disqualifiers: ['engine unavailable'] },
    },
    snapshot: {
      symbol,
      timeframe: tf,
      last_close: latestBar?.c ?? 0,
      vol_ratio_3: volRatio,
      oi_change_1h: oiChange1h,
      funding_rate: latestFunding,
      cvd_state: cvdState,
      regime,
    },
    derivatives: {
      funding_rate: latestFunding,
    },
    degraded: true,
  };
}

function barsIntervalFromTf(tf: string): string {
  if (tf === '1d') return '4h';
  if (tf === '4h') return '1h';
  if (tf === '1h') return '15m';
  return '5m';
}

export async function fetchTerminalAnalysisBundle(input: {
  symbol: string;
  tf: string;
}): Promise<{
  analysisData: TerminalAnalyzeData;
  ohlcvBars: MarketSeriesBar[];
  layerBarsMap: Record<string, MarketSeriesBar[]>;
}> {
  const { symbol, tf } = input;
  const interval = barsIntervalFromTf(tf);
  const oiPeriod = barsIntervalFromTf(tf);
  const bundle = await fetchTerminalBundle({ symbol, tf, interval, oiPeriod });

  const marketBars = bundle.ohlcvBars.length > 0 ? bundle.ohlcvBars : [];
  const oiBars = bundle.oiBars.length > 0 ? bundle.oiBars : [];
  const fundingBars = bundle.fundingBars.length > 0 ? bundle.fundingBars : [];

  const layerBarsMap: Record<string, MarketSeriesBar[]> = {};
  if (oiBars.length) layerBarsMap.oi = oiBars;
  if (fundingBars.length) layerBarsMap.flow = fundingBars;

  let data: TerminalAnalyzeData;
  if (bundle.analyze) {
    data = bundle.analyze as TerminalAnalyzeData;
  } else {
    data = buildMarketOnlyEnvelope(symbol, tf, 'Engine analysis request failed', marketBars, oiBars, fundingBars);
  }

  const analysisData = enrichAnalyzePayload({
    baseData: data,
    snapshotPayload: bundle.snapshot,
    derivativesPayload: bundle.derivatives,
  }) as TerminalAnalyzeData;

  return {
    analysisData,
    ohlcvBars: marketBars,
    layerBarsMap,
  };
}

export async function fetchTrendingData(): Promise<any | null> {
  const res = await fetch('/api/market/trending');
  if (!res.ok) return null;
  return res.json();
}

export async function fetchNewsData(): Promise<any | null> {
  const res = await fetch('/api/market/news');
  if (!res.ok) return null;
  return res.json();
}

export async function fetchScannerAlerts(limit = 12): Promise<any[]> {
  const res = await fetch(`/api/cogochi/alerts?limit=${limit}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.alerts ?? [];
}

export async function fetchPatternPhasesData(): Promise<Array<{ slug: string; phaseName: string; symbols: string[] }>> {
  const res = await fetch('/api/patterns/states');
  if (!res.ok) return [];
  const data = await res.json();
  const states: Record<string, Record<string, any>> = data.states ?? {};
  const bySlug: Record<string, { phaseName: string; symbols: string[] }> = {};
  for (const [sym, slugMap] of Object.entries(states)) {
    for (const [slug, info] of Object.entries(slugMap as Record<string, any>)) {
      if (!bySlug[slug]) bySlug[slug] = { phaseName: info.phase_name ?? info.current_phase ?? '', symbols: [] };
      bySlug[slug].symbols.push(sym.replace('USDT', ''));
    }
  }
  return Object.entries(bySlug).map(([slug, v]) => ({ slug, ...v }));
}

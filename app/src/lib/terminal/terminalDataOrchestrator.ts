import { enrichAnalyzePayload } from '$lib/terminal/backendBridge';
import { fetchTerminalBundle, type ChartSeriesPayload } from '$lib/api/terminalBackend';
import type {
  AnalyzeEnvelope,
  DerivativesEnvelope,
  SnapshotEnvelope,
  TerminalAnomaliesEnvelope,
  TerminalAnomaly,
  DepthLadderEnvelope,
  LiquidationClustersEnvelope,
  TerminalPreset,
  TerminalQueryPresetsEnvelope,
  TerminalStatusEnvelope,
} from '$lib/contracts/terminalBackend';

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

export async function fetchTerminalAnalysisBundle(input: {
  symbol: string;
  tf: string;
}): Promise<{
  analysisData: TerminalAnalyzeData;
  ohlcvBars: MarketSeriesBar[];
  layerBarsMap: Record<string, MarketSeriesBar[]>;
  chartPayload: ChartSeriesPayload | null;
}> {
  const { symbol, tf } = input;
  const bundle = await fetchTerminalBundle({ symbol, tf });

  const marketBars = (bundle.chartPayload?.klines ?? []).map((bar) => ({
    t: bar.time,
    c: bar.close,
    v: bar.volume,
    delta: (bar.close >= bar.open ? 1 : -1) * bar.volume,
    cvd: 0,
  }));
  let runningCvd = 0;
  for (const bar of marketBars) {
    runningCvd += bar.delta;
    bar.cvd = runningCvd;
  }
  const oiBars = (bundle.chartPayload?.oiBars ?? []).map((bar) => ({
    t: bar.time,
    c: bar.value,
    v: Math.abs(bar.value),
    delta: bar.value,
    cvd: 0,
  }));
  const fundingBars = (bundle.chartPayload?.fundingBars ?? []).map((bar) => ({
    t: bar.time,
    c: bar.value,
    v: Math.abs(bar.value),
    delta: bar.value,
    cvd: 0,
  }));

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
    chartPayload: bundle.chartPayload,
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
  const patterns: Record<string, Record<string, any>> = data.patterns ?? {};
  const rows: Array<{ slug: string; phaseName: string; symbols: string[] }> = [];

  for (const [slug, symbolMap] of Object.entries(patterns)) {
    const byPhase: Record<string, string[]> = {};
    for (const [sym, info] of Object.entries(symbolMap as Record<string, any>)) {
      const phaseName = info.phase_label ?? info.phase_id ?? 'UNKNOWN';
      if (!byPhase[phaseName]) byPhase[phaseName] = [];
      byPhase[phaseName].push(sym.replace('USDT', ''));
    }
    for (const [phaseName, symbols] of Object.entries(byPhase)) {
      rows.push({ slug, phaseName, symbols });
    }
  }

  return rows;
}

export async function fetchTerminalStatusData(): Promise<TerminalStatusEnvelope['data'] | null> {
  const res = await fetch('/api/terminal/status');
  if (!res.ok) return null;
  const data = (await res.json()) as TerminalStatusEnvelope;
  return data.data ?? null;
}

export async function fetchTerminalQueryPresets(): Promise<TerminalPreset[]> {
  const res = await fetch('/api/terminal/query-presets');
  if (!res.ok) return [];
  const data = (await res.json()) as TerminalQueryPresetsEnvelope;
  return data.presets ?? [];
}

export async function fetchTerminalAnomalies(limit = 12): Promise<TerminalAnomaly[]> {
  const res = await fetch(`/api/terminal/anomalies?limit=${limit}`);
  if (!res.ok) return [];
  const data = (await res.json()) as TerminalAnomaliesEnvelope;
  return data.anomalies ?? [];
}

export async function fetchDepthLadderData(pair: string, timeframe: string): Promise<DepthLadderEnvelope['data'] | null> {
  const res = await fetch(`/api/market/depth-ladder?pair=${encodeURIComponent(pair)}&timeframe=${timeframe}`);
  if (!res.ok) return null;
  const data = (await res.json()) as DepthLadderEnvelope;
  return data.data ?? null;
}

export async function fetchLiquidationClustersData(pair: string, timeframe: string): Promise<LiquidationClustersEnvelope['data'] | null> {
  const res = await fetch(`/api/market/liquidation-clusters?pair=${encodeURIComponent(pair)}&timeframe=${timeframe}`);
  if (!res.ok) return null;
  const data = (await res.json()) as LiquidationClustersEnvelope;
  return data.data ?? null;
}

// ---------------------------------------------------------------------------
// Live signals — W-0092
// ---------------------------------------------------------------------------

export interface LiveSignal {
  symbol: string;
  phase: string;
  path: string;
  entry_hit: boolean;
  fwd_peak_pct: number | null;
  realistic_pct: number | null;
  phase_fidelity: number;
  scanned_at: string;
}

export interface LiveSignalsEnvelope {
  signals: LiveSignal[];
  cached: boolean;
  scanned_at: string;
  cache_ttl_seconds: number;
}

export async function fetchLiveSignals(): Promise<LiveSignalsEnvelope | null> {
  const res = await fetch('/api/live-signals');
  if (!res.ok) return null;
  return res.json() as Promise<LiveSignalsEnvelope>;
}

export async function postLiveSignalVerdict(
  signal: LiveSignal,
  verdict: 'valid' | 'invalid' | 'late' | 'noisy',
  note?: string,
): Promise<boolean> {
  const signalId = `${signal.symbol}_${signal.scanned_at}`;
  const res = await fetch('/api/live-signals/verdict', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      signal_id: signalId,
      symbol: signal.symbol,
      phase: signal.phase,
      verdict,
      note: note ?? null,
    }),
  });
  return res.ok;
}

// ═══════════════════════════════════════════════════════════════
// mountIndicatorPanes — pure LWC series factory for sub-panes
// ═══════════════════════════════════════════════════════════════
//
// Extracted from ChartBoard.svelte so the mounting logic is:
//  (a) testable without Svelte
//  (b) reusable across ChartCanvas / MultiPaneChart / future widgets
//  (c) returns IndicatorSeriesRefs so paneCrosshairSync can look up
//      per-series values from param.seriesData on crosshair move
//
// Time alignment is free — all series live in the same IChartApi
// instance, which shares a single time-scale across all panes (LWC v5.1).

import {
  LineSeries,
  HistogramSeries,
} from 'lightweight-charts';
import type { IChartApi, ISeriesApi, UTCTimestamp } from 'lightweight-charts';
import type { ChartSeriesPayload } from '$lib/api/terminalBackend';
import {
  PANE_INDICATORS,
  computePaneLines,
  type IndicatorKind,
  type ValuePoint,
} from './paneIndicators';

// ── Public types ──────────────────────────────────────────────────────────────

export interface PanePositions {
  rsiOrMacd: number;
  oi:        number;
  cvd:       number;
  funding:   number;
  liq:       number;
}

/** Which indicators to render. Snapshot of the reactive chartIndicators store. */
export interface IndicatorToggles {
  showVolume:      boolean;
  showRSI:         boolean;
  showMACD:        boolean;
  showOI:          boolean;
  showCVD:         boolean;
  showFundingPane: boolean;
  showLiqPane:     boolean;
}

/**
 * All series references returned after mounting.
 * paneCrosshairSync uses these to map param.seriesData → chip values.
 */
export interface IndicatorSeriesRefs {
  // RSI
  rsiLine?:    ISeriesApi<'Line'>;
  rsiOb?:      ISeriesApi<'Line'>;  // overbought line
  rsiOs?:      ISeriesApi<'Line'>;  // oversold line
  // MACD
  macdHist?:   ISeriesApi<'Histogram'>;
  macdLine?:   ISeriesApi<'Line'>;
  macdSignal?: ISeriesApi<'Line'>;
  // Generic windowed panes: ordered [raw?, ...windowLines]
  oiSeries:    ISeriesApi<'Line'>[];
  cvdSeries:   ISeriesApi<'Line'>[];
  fundingSeries: ISeriesApi<'Line'>[];
  // Liq: separate histogram pair + net MA
  liqLong?:    ISeriesApi<'Histogram'>;
  liqShort?:   ISeriesApi<'Histogram'>;
  liqNetLines: ISeriesApi<'Line'>[];
}

export interface MountResult {
  positions:  PanePositions;
  seriesRefs: IndicatorSeriesRefs;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

type LinePoint  = { time: UTCTimestamp; value: number };
type HistoPoint = { time: UTCTimestamp; value: number; color?: string };

function toLine(arr: Array<{ time: number; value: number }>): LinePoint[] {
  return arr
    .filter((p) => Number.isFinite(p.value))
    .map((p) => ({ time: p.time as UTCTimestamp, value: p.value }));
}

function toHisto(arr: Array<{ time: number; value: number; color?: string }>): HistoPoint[] {
  return arr.map((p) => ({ time: p.time as UTCTimestamp, value: p.value, color: p.color }));
}

/**
 * Mount a generic windowed pane (raw bar + SMA/EMA window lines).
 * Returns [rawSeries?, ...windowSeries] so crosshair sync can index them.
 */
function mountWindowedPane(
  chart: IChartApi,
  kind: IndicatorKind,
  rawBars: ValuePoint[],
  tf: string,
  paneIndex: number,
): ISeriesApi<'Line'>[] {
  const spec = PANE_INDICATORS[kind];
  const { rawLine, windowLines } = computePaneLines(spec, rawBars, tf);
  const series: ISeriesApi<'Line'>[] = [];

  if (spec.includeRaw && rawLine.length > 0) {
    const raw = chart.addSeries(
      LineSeries,
      {
        color: spec.rawColor,
        lineWidth: 1,
        lastValueVisible: false,
        priceLineVisible: false,
        title: 'raw',
      },
      paneIndex,
    );
    raw.setData(rawLine);
    series.push(raw);
  }

  for (const { window, data } of windowLines) {
    const line = chart.addSeries(
      LineSeries,
      {
        color: window.color,
        lineWidth: window.lineWidth ?? 2,
        lastValueVisible: true,
        priceLineVisible: false,
        title: window.label,
      },
      paneIndex,
    );
    line.setData(data);
    series.push(line);
  }

  return series;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Mount all active indicator sub-panes on `chart`.
 *
 * Call once per renderCharts() cycle (chart is freshly created).
 * Pane 0 is reserved for price + volume overlay. Indicator panes
 * start at index 1 and are allocated in deterministic order:
 *   RSI|MACD → OI → CVD → Funding → Liq
 *
 * All panes share the same time-scale as pane 0 (LWC v5.1 native).
 */
export function mountIndicatorPanes(
  chart: IChartApi,
  payload: ChartSeriesPayload,
  klines: ChartSeriesPayload['klines'],
  ind: Record<string, unknown>,
  toggles: IndicatorToggles,
  tf: string,
): MountResult {
  const positions: PanePositions = { rsiOrMacd: -1, oi: -1, cvd: -1, funding: -1, liq: -1 };
  const refs: IndicatorSeriesRefs = {
    oiSeries: [],
    cvdSeries: [],
    fundingSeries: [],
    liqNetLines: [],
  };
  let nextPane = 1; // pane 0 = price + volume

  // ── Volume overlay on pane 0 ──────────────────────────────────────────────
  if (toggles.showVolume && klines.length) {
    const volSeries = chart.addSeries(
      HistogramSeries,
      {
        color: 'rgba(99,179,237,0.35)',
        priceFormat: { type: 'volume' as const },
        priceScaleId: 'volume',
        lastValueVisible: false,
      },
      0,
    );
    try {
      chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    } catch { /* ignore */ }
    volSeries.setData(
      toHisto(
        klines.map((k) => ({
          time: k.time,
          value: k.volume,
          color: k.close >= k.open ? 'rgba(38,166,154,0.45)' : 'rgba(239,83,80,0.45)',
        })),
      ),
    );
  }

  // ── RSI or MACD (mutex — MACD takes precedence) ───────────────────────────
  if (toggles.showMACD) {
    const macdData = (ind.macd ?? []) as Array<{ time: number; macd: number; signal: number; hist: number }>;
    if (macdData.length) {
      const idx = nextPane++;
      positions.rsiOrMacd = idx;

      const histSeries = chart.addSeries(
        HistogramSeries,
        { priceFormat: { type: 'price', precision: 6, minMove: 0.000001 }, lastValueVisible: false, title: 'hist' },
        idx,
      );
      histSeries.setData(
        macdData.map((d) => ({
          time:  d.time as UTCTimestamp,
          value: d.hist,
          color: d.hist >= 0 ? 'rgba(38,166,154,0.7)' : 'rgba(239,83,80,0.7)',
        })),
      );
      refs.macdHist = histSeries;

      const macdLine = chart.addSeries(
        LineSeries,
        { color: '#63b3ed', lineWidth: 1, lastValueVisible: true, priceLineVisible: false, title: 'MACD' },
        idx,
      );
      macdLine.setData(macdData.map((d) => ({ time: d.time as UTCTimestamp, value: d.macd })));
      refs.macdLine = macdLine;

      const sigLine = chart.addSeries(
        LineSeries,
        { color: '#fbbf24', lineWidth: 1, lastValueVisible: true, priceLineVisible: false, title: 'signal' },
        idx,
      );
      sigLine.setData(macdData.map((d) => ({ time: d.time as UTCTimestamp, value: d.signal })));
      refs.macdSignal = sigLine;
    }
  } else if (toggles.showRSI) {
    const rsiData = (ind.rsi14 ?? []) as Array<{ time: number; value: number }>;
    if (rsiData.length) {
      const idx = nextPane++;
      positions.rsiOrMacd = idx;

      const rsiLine = chart.addSeries(
        LineSeries,
        { color: '#fbbf24', lineWidth: 2, lastValueVisible: true, priceLineVisible: false, title: 'RSI 14' },
        idx,
      );
      rsiLine.setData(toLine(rsiData));
      refs.rsiLine = rsiLine;

      const ob = chart.addSeries(
        LineSeries,
        { color: 'rgba(239,83,80,0.45)', lineWidth: 1, lineStyle: 2 as const, lastValueVisible: false, priceLineVisible: false },
        idx,
      );
      const os = chart.addSeries(
        LineSeries,
        { color: 'rgba(38,166,154,0.45)', lineWidth: 1, lineStyle: 2 as const, lastValueVisible: false, priceLineVisible: false },
        idx,
      );
      ob.setData(rsiData.map((p) => ({ time: p.time as UTCTimestamp, value: 70 })));
      os.setData(rsiData.map((p) => ({ time: p.time as UTCTimestamp, value: 30 })));
      refs.rsiOb = ob;
      refs.rsiOs = os;
    }
  }

  // ── OI pane ───────────────────────────────────────────────────────────────
  if (toggles.showOI && (payload.oiBars?.length ?? 0) > 0) {
    const idx = nextPane++;
    positions.oi = idx;
    refs.oiSeries = mountWindowedPane(
      chart,
      'oi',
      payload.oiBars.map((b) => ({ time: b.time, value: b.value })),
      tf,
      idx,
    );
  }

  // ── CVD pane ──────────────────────────────────────────────────────────────
  if (toggles.showCVD) {
    const cvdRaw: ValuePoint[] =
      payload.cvdBars?.length
        ? payload.cvdBars.map((b) => ({ time: b.time, value: b.value }))
        : (() => {
            let cum = 0;
            return klines.map((k) => {
              cum += (k.close >= k.open ? 1 : -1) * k.volume;
              return { time: k.time, value: cum };
            });
          })();
    if (cvdRaw.length) {
      const idx = nextPane++;
      positions.cvd = idx;
      refs.cvdSeries = mountWindowedPane(chart, 'cvd', cvdRaw, tf, idx);
    }
  }

  // ── Funding pane ──────────────────────────────────────────────────────────
  const fb = (payload.fundingBars ?? []) as Array<{ time: number; value: number }>;
  if (toggles.showFundingPane && fb.length > 0) {
    const idx = nextPane++;
    positions.funding = idx;
    refs.fundingSeries = mountWindowedPane(
      chart,
      'funding',
      fb.map((b) => ({ time: b.time, value: b.value })),
      tf,
      idx,
    );
  }

  // ── Liquidations pane ─────────────────────────────────────────────────────
  if (toggles.showLiqPane && (payload.liqBars?.length ?? 0) > 0) {
    const liqBars = payload.liqBars!;
    const idx = nextPane++;
    positions.liq = idx;

    const longSeries = chart.addSeries(
      HistogramSeries,
      { color: 'rgba(52,211,153,0.65)', priceFormat: { type: 'volume' }, lastValueVisible: false, title: 'long' },
      idx,
    );
    const shortSeries = chart.addSeries(
      HistogramSeries,
      { color: 'rgba(248,113,113,0.65)', priceFormat: { type: 'volume' }, lastValueVisible: false, title: 'short' },
      idx,
    );
    longSeries.setData(liqBars.map((b) => ({ time: b.time as UTCTimestamp, value: b.longUsd })));
    shortSeries.setData(liqBars.map((b) => ({ time: b.time as UTCTimestamp, value: -b.shortUsd })));
    refs.liqLong = longSeries;
    refs.liqShort = shortSeries;

    const netSpec = PANE_INDICATORS.liq;
    const netBars: ValuePoint[] = liqBars.map((b) => ({ time: b.time, value: b.longUsd - b.shortUsd }));
    const { windowLines } = computePaneLines(netSpec, netBars, tf);
    refs.liqNetLines = windowLines.map(({ window, data }) => {
      const line = chart.addSeries(
        LineSeries,
        {
          color: window.color,
          lineWidth: window.lineWidth ?? 2,
          lastValueVisible: true,
          priceLineVisible: false,
          title: window.label,
        },
        idx,
      );
      line.setData(data);
      return line;
    });
  }

  // ── Stretch factors: price 4×, every indicator 1× ───────────────────────
  try {
    const allPanes = chart.panes();
    if (allPanes.length > 0) {
      allPanes[0].setStretchFactor(4);
      for (let i = 1; i < allPanes.length; i++) allPanes[i].setStretchFactor(1);
    }
  } catch { /* setStretchFactor only available v5.0.8+ */ }

  return { positions, seriesRefs: refs };
}

/**
 * Refresh liq pane histograms in place (WS / poll update).
 * Does not re-create the pane — just pushes new data onto kept series.
 */
export function refreshLiqPane(
  refs: IndicatorSeriesRefs,
  liqBars: Array<{ time: number; longUsd: number; shortUsd: number }>,
): void {
  if (!refs.liqLong || !refs.liqShort || liqBars.length === 0) return;
  refs.liqLong.setData(liqBars.map((b) => ({ time: b.time as UTCTimestamp, value: b.longUsd })));
  refs.liqShort.setData(liqBars.map((b) => ({ time: b.time as UTCTimestamp, value: -b.shortUsd })));
}

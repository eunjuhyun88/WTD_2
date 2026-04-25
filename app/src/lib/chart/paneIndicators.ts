// ═══════════════════════════════════════════════════════════════
// Pane Indicators — multi-window indicator helpers for lightweight-charts panes
// ═══════════════════════════════════════════════════════════════
//
// Why this exists:
//  CryptoQuant / Velo / Material Indicators show multiple time-windowed
//  series in the same indicator pane (e.g. CVD raw + 7d MA + 14d MA).
//  Our backend (`ChartSeriesPayload`) only delivers raw bars — windowed
//  averages are derived client-side from those raw bars.
//
// What this exposes:
//  • simpleMovingAverage(bars, window)         — generic SMA over {time,value}[]
//  • exponentialMovingAverage(bars, window)    — EMA variant
//  • maPaletteFor(kind)                        — color palette per indicator family
//  • PANE_INDICATORS                           — declarative registry
//
// Each registry entry declares the windows + colors a pane should render
// so the chart component stays dumb.

import type { UTCTimestamp } from 'lightweight-charts';

export interface ValuePoint {
  time: number;
  value: number;
}

export interface LinePoint {
  time: UTCTimestamp;
  value: number;
}

/** Simple moving average. Returns NaN-padded points (skipped on output). */
export function simpleMovingAverage(bars: ValuePoint[], window: number): LinePoint[] {
  if (window <= 1 || bars.length < window) return [];
  const out: LinePoint[] = [];
  let sum = 0;
  for (let i = 0; i < bars.length; i++) {
    sum += bars[i].value;
    if (i >= window) sum -= bars[i - window].value;
    if (i >= window - 1) out.push({ time: bars[i].time as UTCTimestamp, value: sum / window });
  }
  return out;
}

/** Exponential moving average. */
export function exponentialMovingAverage(bars: ValuePoint[], window: number): LinePoint[] {
  if (window <= 1 || bars.length === 0) return [];
  const k = 2 / (window + 1);
  const out: LinePoint[] = [];
  let ema = bars[0].value;
  for (let i = 0; i < bars.length; i++) {
    ema = i === 0 ? bars[i].value : bars[i].value * k + ema * (1 - k);
    out.push({ time: bars[i].time as UTCTimestamp, value: ema });
  }
  return out;
}

export type IndicatorKind = 'cvd' | 'funding' | 'oi' | 'liq';

export interface PaneWindow {
  /** Display label, e.g. "7d", "14d" */
  label: string;
  /** Number of bars to average over */
  window: number;
  /** Hex color */
  color: string;
  /** EMA vs SMA */
  smoothing?: 'sma' | 'ema';
  /** Line width in px */
  lineWidth?: 1 | 2 | 3;
}

export interface PaneIndicatorSpec {
  id: IndicatorKind;
  title: string;
  /** When true, the pane renders the raw series + the windows. */
  includeRaw: boolean;
  /** Color of the raw series, if shown. */
  rawColor: string;
  /** Suggested stretch factor relative to other panes (price = 4). */
  stretchFactor: number;
  /** Multi-window MA lines layered on top of the raw series. */
  windows: PaneWindow[];
  /** Pretty-formatter for crosshair label. */
  format: (v: number) => string;
}

const fmtPct = (decimals = 2) => (v: number) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(decimals)}%`;
const fmtSigned = (decimals = 4) => (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(decimals)}`;
const fmtCompactUsd = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return v.toFixed(0);
};

export const PANE_INDICATORS: Record<IndicatorKind, PaneIndicatorSpec> = {
  cvd: {
    id: 'cvd',
    title: 'CVD',
    includeRaw: true,
    rawColor: 'rgba(160,180,200,0.55)',
    stretchFactor: 1,
    windows: [
      { label: '7d',  window: 7  * 24, color: '#34c470', lineWidth: 2, smoothing: 'sma' },
      { label: '14d', window: 14 * 24, color: '#e8b84b', lineWidth: 2, smoothing: 'sma' },
      { label: '30d', window: 30 * 24, color: '#ff7b54', lineWidth: 2, smoothing: 'sma' },
    ],
    format: fmtCompactUsd,
  },
  funding: {
    id: 'funding',
    title: 'Funding',
    includeRaw: true,
    rawColor: 'rgba(232,184,75,0.55)',
    stretchFactor: 1,
    windows: [
      { label: '7d avg',  window: 7  * 8, color: '#e8b84b', lineWidth: 2, smoothing: 'sma' },
      { label: '14d avg', window: 14 * 8, color: '#ff7b54', lineWidth: 1, smoothing: 'sma' },
    ],
    format: fmtSigned(4),
  },
  oi: {
    id: 'oi',
    title: 'OI Δ',
    includeRaw: true,
    rawColor: 'rgba(120,170,250,0.55)',
    stretchFactor: 1,
    windows: [
      { label: '7d MA',  window: 7  * 24, color: '#3a86ff', lineWidth: 2, smoothing: 'sma' },
      { label: '14d MA', window: 14 * 24, color: '#8338ec', lineWidth: 2, smoothing: 'sma' },
    ],
    format: fmtPct(2),
  },
  liq: {
    id: 'liq',
    title: 'Liquidations',
    includeRaw: false, // liq pane uses two histograms (long/short) instead
    rawColor: '',
    stretchFactor: 1,
    windows: [
      { label: 'net 7d MA', window: 7 * 24, color: '#ffffff', lineWidth: 2, smoothing: 'sma' },
    ],
    format: fmtCompactUsd,
  },
};

/**
 * Bars per 24h for a given timeframe string.
 * Funding bars are special — Binance settles funding 8x/day regardless of
 * the chart tf, so funding-bar density is tf-independent.
 */
export function barsPerDay(tf: string, kind?: IndicatorKind): number {
  if (kind === 'funding') return 8;
  switch (tf) {
    case '1m':  return 1440;
    case '3m':  return 480;
    case '5m':  return 288;
    case '15m': return 96;
    case '30m': return 48;
    case '1h':  return 24;
    case '2h':  return 12;
    case '4h':  return 6;
    case '6h':  return 4;
    case '8h':  return 3;
    case '12h': return 2;
    case '1d':  return 1;
    case '3d':  return 1 / 3;
    case '1w':  return 1 / 7;
    default:    return 24; // safe fallback (hourly)
  }
}

/**
 * Re-scale a spec's window bar counts to the active timeframe.
 * Window labels are parsed for "Nd" and rescaled to N * barsPerDay(tf, kind).
 * Labels without a "Nd" pattern (e.g. "net 7d MA") still match.
 */
export function scaledWindows(spec: PaneIndicatorSpec, tf: string): PaneWindow[] {
  const bpd = barsPerDay(tf, spec.id);
  return spec.windows.map((w) => {
    const m = w.label.match(/(\d+)\s*d/i);
    if (!m) return w; // leave untouched
    const days = parseInt(m[1], 10);
    if (!Number.isFinite(days) || days <= 0) return w;
    return { ...w, window: Math.max(2, Math.round(days * bpd)) };
  });
}

/**
 * Compute every line a pane needs (raw + windowed MAs).
 * Caller passes the raw bars; this returns ready-to-setData arrays.
 */
export function computePaneLines(
  spec: PaneIndicatorSpec,
  bars: ValuePoint[],
  tf?: string,
): { rawLine: LinePoint[]; windowLines: { window: PaneWindow; data: LinePoint[] }[] } {
  const rawLine: LinePoint[] = spec.includeRaw
    ? bars.map((b) => ({ time: b.time as UTCTimestamp, value: b.value }))
    : [];

  const windows = tf ? scaledWindows(spec, tf) : spec.windows;

  const windowLines = windows.map((w) => {
    const data = w.smoothing === 'ema'
      ? exponentialMovingAverage(bars, w.window)
      : simpleMovingAverage(bars, w.window);
    return { window: w, data };
  });

  return { rawLine, windowLines };
}

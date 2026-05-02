// ═══════════════════════════════════════════════════════════════
// Pane current-value extractors
// ═══════════════════════════════════════════════════════════════
//
// Given the same raw bars + spec used by the chart, derive the chips that
// PaneInfoBar should display: { color, label, value, delta } per series.
//
// All work is pure / O(N) — safe to recompute on every chart render.

import {
  PANE_INDICATORS,
  scaledWindows,
  simpleMovingAverage,
  exponentialMovingAverage,
  type IndicatorKind,
  type PaneIndicatorSpec,
  type ValuePoint,
} from './paneIndicators';

import type { InfoChip } from '$lib/hubs/terminal/workspace/PaneInfoBar.svelte';

function fmtCompactUsd(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return v.toFixed(0);
}
function fmtPct(v: number, d = 2): string {
  return `${v >= 0 ? '+' : ''}${(v * 100).toFixed(d)}%`;
}
function fmtSigned(v: number, d = 4): string {
  return `${v >= 0 ? '+' : ''}${v.toFixed(d)}`;
}

function formatBy(kind: IndicatorKind, v: number | null): string {
  if (v == null || !Number.isFinite(v)) return '—';
  if (kind === 'oi') return fmtPct(v, 2);
  if (kind === 'funding') return fmtSigned(v, 4);
  if (kind === 'cvd' || kind === 'liq') return fmtCompactUsd(v);
  return v.toFixed(2);
}

function lastValue(arr: number[]): number | null {
  for (let i = arr.length - 1; i >= 0; i--) if (Number.isFinite(arr[i])) return arr[i];
  return null;
}

function relDelta(curr: number | null, prev: number | null): number | null {
  if (curr == null || prev == null) return null;
  if (!Number.isFinite(curr) || !Number.isFinite(prev) || prev === 0) return null;
  return (curr - prev) / Math.abs(prev);
}

export interface ChipsResult {
  spec: PaneIndicatorSpec;
  chips: InfoChip[];
}

/**
 * Compute chips for an indicator pane (raw + per-window MA).
 * `tf` is used so window sizes adapt to the active timeframe.
 */
export function computePaneChips(
  kind: IndicatorKind,
  bars: ValuePoint[],
  tf?: string,
): ChipsResult {
  const spec = PANE_INDICATORS[kind];
  const chips: InfoChip[] = [];
  if (bars.length === 0) return { spec, chips };

  const windows = tf ? scaledWindows(spec, tf) : spec.windows;
  const lastBar = bars[bars.length - 1];
  const prevBar = bars.length > 1 ? bars[bars.length - 2] : null;

  if (spec.includeRaw) {
    chips.push({
      key: 'raw',
      color: spec.rawColor,
      label: 'raw',
      value: formatBy(kind, lastBar.value),
      delta: relDelta(lastBar.value, prevBar?.value ?? null) ?? undefined,
    });
  }

  for (const w of windows) {
    const series = w.smoothing === 'ema'
      ? exponentialMovingAverage(bars, w.window).map((p) => p.value)
      : simpleMovingAverage(bars, w.window).map((p) => p.value);
    const curr = lastValue(series);
    const prev = series.length > 1 ? series[series.length - 2] : null;
    chips.push({
      key: w.label,
      color: w.color,
      label: w.label,
      value: formatBy(kind, curr),
      delta: relDelta(curr, prev) ?? undefined,
    });
  }

  return { spec, chips };
}

/**
 * Liquidation pane is a special case: long histogram + short histogram +
 * net MA. Build chips that summarize the most recent bar.
 */
export function computeLiqChips(
  liqBars: Array<{ time: number; longUsd: number; shortUsd: number }>,
  tf?: string,
): ChipsResult {
  const spec = PANE_INDICATORS.liq;
  const chips: InfoChip[] = [];
  if (liqBars.length === 0) return { spec, chips };

  const last = liqBars[liqBars.length - 1];
  const prev = liqBars.length > 1 ? liqBars[liqBars.length - 2] : null;

  chips.push({
    key: 'long',
    color: 'rgba(52,211,153,0.85)',
    label: 'long',
    value: fmtCompactUsd(last.longUsd),
    delta: (prev ? relDelta(last.longUsd, prev.longUsd) : null) ?? undefined,
    tone: 'bull',
  });
  chips.push({
    key: 'short',
    color: 'rgba(248,113,113,0.85)',
    label: 'short',
    value: fmtCompactUsd(last.shortUsd),
    delta: (prev ? relDelta(last.shortUsd, prev.shortUsd) : null) ?? undefined,
    tone: 'bear',
  });

  const netBars: ValuePoint[] = liqBars.map((b) => ({ time: b.time, value: b.longUsd - b.shortUsd }));
  const windows = tf ? scaledWindows(spec, tf) : spec.windows;
  for (const w of windows) {
    const series = simpleMovingAverage(netBars, w.window).map((p) => p.value);
    const curr = lastValue(series);
    const prevS = series.length > 1 ? series[series.length - 2] : null;
    chips.push({
      key: w.label,
      color: w.color,
      label: w.label,
      value: fmtCompactUsd(curr ?? 0),
      delta: relDelta(curr, prevS) ?? undefined,
    });
  }

  return { spec, chips };
}

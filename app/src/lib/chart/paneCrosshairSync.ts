// ═══════════════════════════════════════════════════════════════
// paneCrosshairSync — crosshair → live per-pane chip values
// ═══════════════════════════════════════════════════════════════
//
// When the user moves their cursor over the chart, this module reads
// the value of every indicator series at the crosshair timestamp and
// calls onUpdate() with fresh InfoChip arrays — one per active pane.
//
// On crosshair leave it calls onUpdate() with null chips so the parent
// can revert to the last-bar chips computed from chartData.
//
// Uses rAF throttle (same pattern as W-0391-A) to stay at 60fps
// without layout thrash.

import type { IChartApi, ISeriesApi, MouseEventParams, SeriesType, Time } from 'lightweight-charts';
import type { InfoChip } from '$lib/hubs/terminal/workspace/PaneInfoBar.svelte';
import type { IndicatorSeriesRefs, PanePositions } from './mountIndicatorPanes';
import { PANE_INDICATORS, type IndicatorKind } from './paneIndicators';

type AnySeries = ISeriesApi<SeriesType, Time>;

// ── Public types ──────────────────────────────────────────────────────────────

export interface CrosshairChips {
  rsiOrMacd: InfoChip[] | null;
  oi:        InfoChip[] | null;
  cvd:       InfoChip[] | null;
  funding:   InfoChip[] | null;
  liq:       InfoChip[] | null;
}

/** Return value: call to unsubscribe from the chart's crosshair event. */
export type CrosshairUnsubscribe = () => void;

// ── Formatters (mirrors paneCurrentValues.ts, kept local to avoid coupling) ──

function fmtCompact(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return v.toFixed(0);
}
function fmtPct(v: number): string  { return `${v >= 0 ? '+' : ''}${(v * 100).toFixed(2)}%`; }
function fmtSign(v: number): string { return `${v >= 0 ? '+' : ''}${v.toFixed(4)}`; }

function fmtByKind(kind: IndicatorKind, v: number | null): string {
  if (v == null || !Number.isFinite(v)) return '—';
  if (kind === 'oi')      return fmtPct(v);
  if (kind === 'funding') return fmtSign(v);
  return fmtCompact(v);
}

// ── Value extraction helpers ──────────────────────────────────────────────────

/** Read a numeric value from param.seriesData for a given series. */
function readValue(param: MouseEventParams, series: AnySeries | undefined): number | null {
  if (!series) return null;
  const d = param.seriesData.get(series) as { value?: number; close?: number } | undefined;
  const v = d?.value ?? d?.close;
  return v != null && Number.isFinite(v) ? v : null;
}

/**
 * Build chips for a windowed pane (raw + MA window lines) from crosshair data.
 * `seriesList` mirrors the order returned by mountWindowedPane: [raw?, ...windows].
 */
function crosshairChipsForWindowed(
  param: MouseEventParams,
  kind: IndicatorKind,
  seriesList: AnySeries[],
): InfoChip[] | null {
  if (seriesList.length === 0) return null;
  const spec = PANE_INDICATORS[kind];
  const chips: InfoChip[] = [];

  let seriesIdx = 0;

  if (spec.includeRaw) {
    const v = readValue(param, seriesList[seriesIdx++]);
    if (v != null) {
      chips.push({ key: 'raw', color: spec.rawColor, label: 'raw', value: fmtByKind(kind, v) });
    }
  }

  for (const w of spec.windows) {
    const s = seriesList[seriesIdx++];
    if (!s) break;
    const v = readValue(param, s);
    chips.push({ key: w.label, color: w.color, label: w.label, value: fmtByKind(kind, v) });
  }

  return chips.length ? chips : null;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Subscribe to the chart's crosshair and call onUpdate() with live chip values.
 *
 * @returns Unsubscribe function — call in component cleanup or before chart destroy.
 */
export function createCrosshairSync(
  chart: IChartApi,
  refs: IndicatorSeriesRefs,
  _positions: PanePositions,
  onUpdate: (chips: CrosshairChips | null) => void,
): CrosshairUnsubscribe {
  let rafId: number | null = null;
  let lastParam: MouseEventParams | null = null;

  function flush() {
    rafId = null;
    const param = lastParam;
    if (!param) return;

    // Crosshair left chart — revert to last-bar chips
    if (!param.time) {
      onUpdate(null);
      return;
    }

    const chips: CrosshairChips = {
      rsiOrMacd: null,
      oi:        null,
      cvd:       null,
      funding:   null,
      liq:       null,
    };

    // RSI
    if (refs.rsiLine) {
      const v = readValue(param, refs.rsiLine);
      if (v != null) {
        chips.rsiOrMacd = [{ key: 'rsi', color: '#fbbf24', label: 'RSI 14', value: v.toFixed(2) }];
      }
    }

    // MACD
    if (refs.macdLine && refs.macdSignal && refs.macdHist) {
      const macd   = readValue(param, refs.macdLine);
      const signal = readValue(param, refs.macdSignal);
      const hist   = readValue(param, refs.macdHist);
      if (macd != null || signal != null || hist != null) {
        chips.rsiOrMacd = [
          { key: 'macd',   color: '#63b3ed', label: 'MACD',   value: macd   != null ? macd.toFixed(4)   : '—' },
          { key: 'signal', color: '#fbbf24', label: 'signal', value: signal != null ? signal.toFixed(4) : '—' },
          { key: 'hist',   color: hist != null && hist >= 0 ? 'rgba(38,166,154,0.9)' : 'rgba(239,83,80,0.9)',
            label: 'hist', value: hist != null ? hist.toFixed(4) : '—',
            tone: hist != null ? (hist >= 0 ? 'bull' : 'bear') : 'neutral' },
        ];
      }
    }

    // OI
    if (refs.oiSeries.length) {
      chips.oi = crosshairChipsForWindowed(param, 'oi', refs.oiSeries);
    }

    // CVD
    if (refs.cvdSeries.length) {
      chips.cvd = crosshairChipsForWindowed(param, 'cvd', refs.cvdSeries);
    }

    // Funding
    if (refs.fundingSeries.length) {
      chips.funding = crosshairChipsForWindowed(param, 'funding', refs.fundingSeries);
    }

    // Liq
    if (refs.liqLong && refs.liqShort) {
      const longV  = readValue(param, refs.liqLong);
      const shortV = readValue(param, refs.liqShort);
      const liqChips: InfoChip[] = [];
      if (longV  != null) liqChips.push({ key: 'long',  color: 'rgba(52,211,153,0.85)',  label: 'long',  value: fmtCompact(longV),       tone: 'bull' });
      if (shortV != null) liqChips.push({ key: 'short', color: 'rgba(248,113,113,0.85)', label: 'short', value: fmtCompact(Math.abs(shortV)), tone: 'bear' });
      for (const s of refs.liqNetLines) {
        const v = readValue(param, s);
        liqChips.push({ key: 'net', color: '#ffffff', label: 'net MA', value: v != null ? fmtCompact(v) : '—' });
      }
      if (liqChips.length) chips.liq = liqChips;
    }

    onUpdate(chips);
  }

  function handler(param: MouseEventParams) {
    lastParam = param;
    if (rafId === null) {
      rafId = requestAnimationFrame(flush);
    }
  }

  chart.subscribeCrosshairMove(handler);

  return () => {
    chart.unsubscribeCrosshairMove(handler);
    if (rafId !== null) cancelAnimationFrame(rafId);
  };
}

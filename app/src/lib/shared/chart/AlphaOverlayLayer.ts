/**
 * AlphaOverlayLayer.ts  (W-0210 Layer 1)
 *
 * Translates engine analysis output into lightweight-charts visual overlays:
 *   • ATR TP1 / Stop price lines
 *   • Phase markers from alphaMarkers array
 *   • Breakout signal arrows (arrowUp / arrowDown)
 *   • Wyckoff phase text marker at latest candle
 *
 * Pure imperative class — no Svelte reactivity inside.
 * ChartBoard calls `apply(analysis)` after each analyze response.
 *
 * Performance: O(n) evidence items, typically 5-15 per call.
 * Clears + rebuilds on each `apply()`. No per-candle overhead.
 */

import { createSeriesMarkers } from 'lightweight-charts';
import type {
  IChartApi,
  ISeriesApi,
  IPriceLine,
  SeriesMarker,
  UTCTimestamp,
} from 'lightweight-charts';
import type { PanelAnalyzeData } from '$lib/terminal/panelAdapter';

interface AlphaMarker {
  timestamp: number;
  phase: string;
  label: string;
  color?: string;
  shape?: 'circle' | 'square' | 'arrowUp' | 'arrowDown';
}

// ── Price line handles ────────────────────────────────────────────────────────

export class AlphaOverlayLayer {
  private _series: ISeriesApi<'Candlestick'>;
  private _chart: IChartApi;
  private _priceLines: IPriceLine[] = [];
  private _markersPlugin: { setMarkers: (markers: SeriesMarker<UTCTimestamp>[]) => void } | null = null;

  constructor(series: ISeriesApi<'Candlestick'>, chart: IChartApi) {
    this._series = series;
    this._chart = chart;
    // Attach the markers plugin once; reuse across apply() calls
    this._markersPlugin = createSeriesMarkers(this._series, []);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  apply(analysis: PanelAnalyzeData | null): void {
    this._clearPriceLines();

    if (!analysis) {
      this._markersPlugin?.setMarkers([]);
      return;
    }

    const markers: SeriesMarker<UTCTimestamp>[] = [];

    // 1. ATR-derived price lines (TP1 and Stop)
    this._applyLevelLines(analysis, markers);

    // 2. Alpha phase markers from engine (Wyckoff phases, CVD events, etc.)
    this._applyPhaseMarkers(analysis, markers);

    // 3. Breakout signal arrows
    this._applyBreakoutArrow(analysis, markers);

    // Sort markers by time ascending (required by LWC)
    markers.sort((a, b) => (a.time as number) - (b.time as number));

    this._markersPlugin?.setMarkers(markers);
  }

  /** Call before destroying the chart series. */
  destroy(): void {
    this._clearPriceLines();
    this._markersPlugin?.setMarkers([]);
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private _clearPriceLines(): void {
    for (const line of this._priceLines) {
      try { this._series.removePriceLine(line); } catch { /* already removed */ }
    }
    this._priceLines = [];
  }

  private _applyLevelLines(
    analysis: PanelAnalyzeData,
    _markers: SeriesMarker<UTCTimestamp>[],
  ): void {
    const deep = (analysis as any)?.deep;
    const dir = (analysis as any)?.direction ?? '';
    const price =
      (analysis as any)?.price ??
      (analysis as any)?.snapshot?.last_close ??
      null;

    if (!deep?.atr_levels) return;
    const lvl = deep.atr_levels;

    if (dir === 'bearish') {
      // TP1 for short
      if (lvl.tp1_short && Number.isFinite(+lvl.tp1_short)) {
        this._addPriceLine(+lvl.tp1_short, '▼ TP1', '#22ab94', 1, 'dashed');
      }
      // Stop for short
      if (lvl.stop_short && Number.isFinite(+lvl.stop_short)) {
        this._addPriceLine(+lvl.stop_short, '✕ Stop', '#f23645', 1, 'dashed');
      }
    } else if (dir === 'bullish') {
      // TP1 for long
      if (lvl.tp1_long && Number.isFinite(+lvl.tp1_long)) {
        this._addPriceLine(+lvl.tp1_long, '▲ TP1', '#22ab94', 1, 'dashed');
      }
      // Stop for long
      if (lvl.stop_long && Number.isFinite(+lvl.stop_long)) {
        this._addPriceLine(+lvl.stop_long, '✕ Stop', '#f23645', 1, 'dashed');
      }
    }

    // Entry line if price is available
    if (price && Number.isFinite(+price)) {
      this._addPriceLine(+price, '● Entry', 'rgba(255,199,80,0.7)', 1, 'solid');
    }
  }

  private _addPriceLine(
    price: number,
    title: string,
    color: string,
    lineWidth: 1 | 2 | 3 | 4,
    lineStyle: 'solid' | 'dashed' | 'dotted' = 'dashed',
  ): void {
    const lineStyleNum =
      lineStyle === 'solid' ? 0 : lineStyle === 'dashed' ? 1 : 2;
    const line = this._series.createPriceLine({
      price,
      color,
      lineWidth,
      lineStyle: lineStyleNum,
      axisLabelVisible: true,
      title,
    });
    this._priceLines.push(line);
  }

  private _applyPhaseMarkers(
    analysis: PanelAnalyzeData,
    markers: SeriesMarker<UTCTimestamp>[],
  ): void {
    const rawMarkers: AlphaMarker[] = (analysis as any)?.alphaMarkers ?? [];
    if (!rawMarkers.length) {
      // Fallback: synthesize a phase marker from the wyckoff_phase field
      const phase = (analysis as any)?.deep?.wyckoff_phase ?? (analysis as any)?.phase;
      const dir = (analysis as any)?.direction ?? 'neutral';
      if (phase) {
        const now = Math.floor(Date.now() / 1000) as UTCTimestamp;
        markers.push({
          time: now,
          position: 'aboveBar',
          color: dir === 'bullish' ? '#22ab94' : dir === 'bearish' ? '#f23645' : '#ffc750',
          shape: 'circle',
          text: phase.length > 20 ? phase.slice(0, 20) + '…' : phase,
          size: 1,
        });
      }
      return;
    }

    for (const m of rawMarkers) {
      if (!m.timestamp || !Number.isFinite(m.timestamp)) continue;
      const t = m.timestamp as UTCTimestamp;
      const isNews = m.phase === 'news';
      const isBreakout = m.phase === 'breakout';
      const shape: SeriesMarker<UTCTimestamp>['shape'] =
        (m.shape as SeriesMarker<UTCTimestamp>['shape']) ??
        (isNews ? 'square' : isBreakout ? 'arrowUp' : 'circle');
      const color =
        m.color ??
        (m.phase === 'bearish' ? '#f23645' : m.phase === 'bullish' ? '#22ab94' : '#ffc750');
      const text = m.label.length > 22 ? m.label.slice(0, 22) + '…' : m.label;

      markers.push({
        time: t,
        position: 'aboveBar',
        color,
        shape,
        text,
        size: 1,
      });
    }
  }

  private _applyBreakoutArrow(
    analysis: PanelAnalyzeData,
    markers: SeriesMarker<UTCTimestamp>[],
  ): void {
    const deep = (analysis as any)?.deep;
    if (!deep?.breakout_signal) return;

    const sig: string = deep.breakout_signal;
    // Only add explicit breakout arrow if not already covered by alphaMarkers
    const rawMarkers: AlphaMarker[] = (analysis as any)?.alphaMarkers ?? [];
    const hasBreakoutMarker = rawMarkers.some(m => m.phase === 'breakout');
    if (hasBreakoutMarker) return;

    const isBullish = sig.toLowerCase().includes('bull') || sig.toLowerCase().includes('up');
    const isBearish = sig.toLowerCase().includes('bear') || sig.toLowerCase().includes('down');
    if (!isBullish && !isBearish) return;

    const now = Math.floor(Date.now() / 1000) as UTCTimestamp;
    markers.push({
      time: now,
      position: isBullish ? 'belowBar' : 'aboveBar',
      color: isBullish ? '#22ab94' : '#f23645',
      shape: isBullish ? 'arrowUp' : 'arrowDown',
      text: sig.length > 18 ? sig.slice(0, 18) + '…' : sig,
      size: 2,
    });
  }
}

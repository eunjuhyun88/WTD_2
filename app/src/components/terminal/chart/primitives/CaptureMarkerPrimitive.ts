/**
 * CaptureMarkerPrimitive.ts
 *
 * LWC v5 ISeriesPrimitive that renders a capture annotation on the chart:
 *   - Vertical entry line at captured_at_s
 *   - Horizontal price lines for entry / stop / tp1 / tp2
 *   - Status badge label (🔵 pending | 🟡 outcome_ready | 🟢 valid | 🔴 invalid)
 *
 * Usage:
 *   const prim = new CaptureMarkerPrimitive(annotation);
 *   series.attachPrimitive(prim);
 *   prim.update(newAnnotation);   // live refresh
 *   series.detachPrimitive(prim);
 */

import type {
  ISeriesPrimitive,
  SeriesAttachedParameter,
  IPrimitivePaneView,
  IPrimitivePaneRenderer,
  Time,
} from 'lightweight-charts';
import type { CanvasRenderingTarget2D } from 'fancy-canvas';

export interface CaptureAnnotation {
  capture_id: string;
  kind: string;
  status: string;
  pattern_slug: string;
  phase: string;
  captured_at_s: number;          // unix seconds — x anchor
  entry_price: number | null;
  stop_price: number | null;
  tp1_price: number | null;
  tp2_price: number | null;
  eval_window_ms: number | null;
  p_win: number | null;
  user_verdict: 'valid' | 'invalid' | 'missed' | null;
}

// ── Colors ────────────────────────────────────────────────────────────────────

const COLORS = {
  entry:   'rgba(77, 143, 245, 0.90)',   // blue
  stop:    'rgba(239, 68, 68, 0.85)',    // red
  tp1:     'rgba(34, 197, 94, 0.85)',    // green
  tp2:     'rgba(134, 239, 172, 0.80)',  // light green
  pending: 'rgba(148, 163, 184, 0.80)',  // slate
  outcome: 'rgba(251, 191, 36, 0.90)',   // amber
  valid:   'rgba(34, 197, 94, 0.90)',    // green
  invalid: 'rgba(239, 68, 68, 0.90)',    // red
  missed:  'rgba(251, 191, 36, 0.80)',   // amber
};

function _statusColor(ann: CaptureAnnotation): string {
  if (ann.user_verdict === 'valid')   return COLORS.valid;
  if (ann.user_verdict === 'invalid') return COLORS.invalid;
  if (ann.user_verdict === 'missed')  return COLORS.missed;
  if (ann.status === 'outcome_ready') return COLORS.outcome;
  return COLORS.pending;
}

// ── Renderer ──────────────────────────────────────────────────────────────────

class CaptureMarkerRenderer implements IPrimitivePaneRenderer {
  constructor(
    private readonly _ann: CaptureAnnotation,
    private readonly _chart: SeriesAttachedParameter['chart'],
    private readonly _series: SeriesAttachedParameter['series'],
  ) {}

  draw(target: CanvasRenderingTarget2D): void {
    const { _ann, _chart, _series } = this;
    if (!_chart || !_series) return;

    target.useBitmapCoordinateSpace((scope) => {
      const ctx = scope.context;
      const ts  = _chart.timeScale();
      const xRaw = ts.timeToCoordinate(_ann.captured_at_s as unknown as Time);
      if (xRaw === null) return;

      const x    = xRaw * scope.horizontalPixelRatio;
      const H    = scope.bitmapSize.height;
      const W    = scope.bitmapSize.width;
      const dpr  = scope.horizontalPixelRatio;
      const statusColor = _statusColor(_ann);

      ctx.save();

      // ── Vertical entry line ────────────────────────────────────────────────
      ctx.strokeStyle = statusColor;
      ctx.lineWidth   = 1.5 * dpr;
      ctx.setLineDash([4 * dpr, 4 * dpr]);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
      ctx.setLineDash([]);

      // ── Horizontal price lines ─────────────────────────────────────────────
      const priceLines: Array<{ price: number | null; color: string; dash?: number[] }> = [
        { price: _ann.entry_price, color: COLORS.entry },
        { price: _ann.stop_price,  color: COLORS.stop,  dash: [3, 3] },
        { price: _ann.tp1_price,   color: COLORS.tp1 },
        { price: _ann.tp2_price,   color: COLORS.tp2 },
      ];

      for (const { price, color, dash } of priceLines) {
        if (price === null || price === undefined) continue;
        const yRaw = _series.priceToCoordinate(price);
        if (yRaw === null) continue;
        const y = yRaw * scope.verticalPixelRatio;

        ctx.strokeStyle = color;
        ctx.lineWidth   = 1.5 * dpr;
        if (dash) ctx.setLineDash(dash.map(v => v * dpr));
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(Math.min(x + 80 * dpr, W), y);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // ── Badge ──────────────────────────────────────────────────────────────
      const label   = `${_ann.phase}${_ann.p_win != null ? ` ${Math.round(_ann.p_win * 100)}%` : ''}`;
      const fontSize = 10 * dpr;
      ctx.font      = `${fontSize}px monospace`;
      const textW   = ctx.measureText(label).width;
      const padX    = 4 * dpr;
      const padY    = 3 * dpr;
      const badgeH  = fontSize + padY * 2;
      const badgeW  = textW + padX * 2;
      const badgeY  = 4 * dpr;

      ctx.fillStyle = statusColor;
      ctx.beginPath();
      ctx.roundRect(x + 3 * dpr, badgeY, badgeW, badgeH, 3 * dpr);
      ctx.fill();

      ctx.fillStyle = '#0f172a';
      ctx.fillText(label, x + 3 * dpr + padX, badgeY + padY + fontSize * 0.85);

      ctx.restore();
    });
  }
}

// ── Pane view ──────────────────────────────────────────────────────────────────

class CaptureMarkerPaneView implements IPrimitivePaneView {
  constructor(
    private _ann: CaptureAnnotation,
    private _chart: SeriesAttachedParameter['chart'] | null,
    private _series: SeriesAttachedParameter['series'] | null,
  ) {}

  zOrder() { return 'top' as const; }

  renderer(): IPrimitivePaneRenderer | null {
    if (!this._chart || !this._series) return null;
    return new CaptureMarkerRenderer(this._ann, this._chart, this._series);
  }

  update(ann: CaptureAnnotation, chart: SeriesAttachedParameter['chart'] | null, series: SeriesAttachedParameter['series'] | null): void {
    this._ann    = ann;
    this._chart  = chart;
    this._series = series;
  }
}

// ── Public primitive ──────────────────────────────────────────────────────────

export class CaptureMarkerPrimitive implements ISeriesPrimitive<Time> {
  private _ann: CaptureAnnotation;
  private _chart: SeriesAttachedParameter['chart'] | null = null;
  private _series: SeriesAttachedParameter['series'] | null = null;
  private _requestUpdate: (() => void) | null = null;
  private _paneView: CaptureMarkerPaneView;

  constructor(annotation: CaptureAnnotation) {
    this._ann      = annotation;
    this._paneView = new CaptureMarkerPaneView(annotation, null, null);
  }

  attached(param: SeriesAttachedParameter<Time>): void {
    this._chart  = param.chart;
    this._series = param.series;
    this._requestUpdate = param.requestUpdate;
    this._paneView.update(this._ann, this._chart, this._series);
  }

  detached(): void {
    this._chart  = null;
    this._series = null;
    this._requestUpdate = null;
  }

  update(ann: CaptureAnnotation): void {
    this._ann = ann;
    this._paneView.update(ann, this._chart, this._series);
    this._requestUpdate?.();
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return [this._paneView];
  }
}

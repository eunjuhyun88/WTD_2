/**
 * EvalWindowPrimitive.ts
 *
 * LWC v5 ISeriesPrimitive that shades the evaluation window on the chart —
 * the time span from captured_at_s to captured_at_s + eval_window_ms.
 *
 * Color key:
 *   pending_outcome  → blue tint (watching)
 *   outcome_ready    → amber tint (needs review)
 *   verdict_ready    → green/red tint (reviewed)
 *
 * Usage:
 *   const prim = new EvalWindowPrimitive(annotation);
 *   series.attachPrimitive(prim);
 *   prim.update(newAnnotation);
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
import type { CaptureAnnotation } from './CaptureMarkerPrimitive';

function _windowFill(ann: CaptureAnnotation): string {
  if (ann.user_verdict === 'valid')   return 'rgba(34, 197, 94, 0.06)';
  if (ann.user_verdict === 'invalid') return 'rgba(239, 68, 68, 0.06)';
  if (ann.user_verdict === 'missed')  return 'rgba(251, 191, 36, 0.06)';
  if (ann.status === 'outcome_ready') return 'rgba(251, 191, 36, 0.08)';
  return 'rgba(77, 143, 245, 0.07)';
}

class EvalWindowRenderer implements IPrimitivePaneRenderer {
  constructor(
    private readonly _ann: CaptureAnnotation,
    private readonly _chart: SeriesAttachedParameter['chart'],
  ) {}

  draw(target: CanvasRenderingTarget2D): void {
    const { _ann, _chart } = this;
    if (!_chart || !_ann.eval_window_ms) return;

    target.useBitmapCoordinateSpace((scope) => {
      const ts = _chart.timeScale();
      const startS = _ann.captured_at_s;
      const endS   = startS + Math.floor(_ann.eval_window_ms! / 1000);

      const xStartRaw = ts.timeToCoordinate(startS as unknown as Time);
      const xEndRaw   = ts.timeToCoordinate(endS   as unknown as Time);
      if (xStartRaw === null || xEndRaw === null) return;

      const dpr  = scope.horizontalPixelRatio;
      const xA   = xStartRaw * dpr;
      const xB   = xEndRaw   * dpr;
      const left = Math.min(xA, xB);
      const w    = Math.abs(xB - xA);

      const ctx = scope.context;
      ctx.save();
      ctx.fillStyle = _windowFill(_ann);
      ctx.fillRect(left, 0, w, scope.bitmapSize.height);
      ctx.restore();
    });
  }
}

class EvalWindowPaneView implements IPrimitivePaneView {
  constructor(
    private _ann: CaptureAnnotation,
    private _chart: SeriesAttachedParameter['chart'] | null,
  ) {}

  zOrder() { return 'bottom' as const; }

  renderer(): IPrimitivePaneRenderer | null {
    if (!this._chart || !this._ann.eval_window_ms) return null;
    return new EvalWindowRenderer(this._ann, this._chart);
  }

  update(ann: CaptureAnnotation, chart: SeriesAttachedParameter['chart'] | null): void {
    this._ann   = ann;
    this._chart = chart;
  }
}

export class EvalWindowPrimitive implements ISeriesPrimitive<Time> {
  private _ann: CaptureAnnotation;
  private _chart: SeriesAttachedParameter['chart'] | null = null;
  private _requestUpdate: (() => void) | null = null;
  private _paneView: EvalWindowPaneView;

  constructor(annotation: CaptureAnnotation) {
    this._ann      = annotation;
    this._paneView = new EvalWindowPaneView(annotation, null);
  }

  attached(param: SeriesAttachedParameter<Time>): void {
    this._chart = param.chart;
    this._requestUpdate = param.requestUpdate;
    this._paneView.update(this._ann, this._chart);
  }

  detached(): void {
    this._chart = null;
    this._requestUpdate = null;
  }

  update(ann: CaptureAnnotation): void {
    this._ann = ann;
    this._paneView.update(ann, this._chart);
    this._requestUpdate?.();
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return [this._paneView];
  }
}

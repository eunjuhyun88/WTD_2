/**
 * RangePrimitive.ts
 *
 * LWC v5 ISeriesPrimitive rendering a range rectangle (Layer 1) with left/right
 * handle indicators. Anchors to time coordinates and survives TF switching.
 *
 * Usage:
 *   const prim = new RangePrimitive();
 *   series.attachPrimitive(prim);
 *   prim.setRange(anchorA, anchorB);
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

interface RangeRendererData {
  anchorA: number | null;  // unix seconds
  anchorB: number | null;  // unix seconds
  fillColor: string;
  strokeColor: string;
}

class RangePaneRenderer implements IPrimitivePaneRenderer {
  private _data: RangeRendererData;
  private _chart: SeriesAttachedParameter['chart'] | null = null;

  constructor(data: RangeRendererData, chart: SeriesAttachedParameter['chart'] | null) {
    this._data = data;
    this._chart = chart;
  }

  draw(target: CanvasRenderingTarget2D): void {
    const { anchorA, anchorB, fillColor, strokeColor } = this._data;
    if (anchorA === null || anchorB === null || !this._chart) return;

    target.useBitmapCoordinateSpace((scope) => {
      const ctx = scope.context;
      const ts = this._chart!.timeScale();

      const xA = ts.timeToCoordinate(anchorA as unknown as Time);
      const xB = ts.timeToCoordinate(anchorB as unknown as Time);
      if (xA === null || xB === null) return;

      const left  = Math.min(xA, xB) * scope.horizontalPixelRatio;
      const right = Math.max(xA, xB) * scope.horizontalPixelRatio;
      const top = 0;
      const bottom = scope.bitmapSize.height;

      // Main fill
      ctx.save();
      ctx.fillStyle = fillColor;
      ctx.fillRect(left, top, right - left, bottom - top);

      // Left handle
      ctx.fillStyle = strokeColor;
      ctx.fillRect(left - 1 * scope.horizontalPixelRatio, top, 2 * scope.horizontalPixelRatio, bottom - top);

      // Right handle
      ctx.fillRect(right - 1 * scope.horizontalPixelRatio, top, 2 * scope.horizontalPixelRatio, bottom - top);

      ctx.restore();
    });
  }
}

class RangePaneView implements IPrimitivePaneView {
  private _data: RangeRendererData;
  private _chart: SeriesAttachedParameter['chart'] | null;

  constructor(data: RangeRendererData, chart: SeriesAttachedParameter['chart'] | null) {
    this._data = data;
    this._chart = chart;
  }

  zOrder() {
    return 'bottom' as const;
  }

  renderer(): IPrimitivePaneRenderer | null {
    if (this._data.anchorA === null || this._data.anchorB === null) return null;
    return new RangePaneRenderer(this._data, this._chart);
  }
}

export class RangePrimitive implements ISeriesPrimitive<Time> {
  private _anchorA: number | null = null;
  private _anchorB: number | null = null;
  private _chart: SeriesAttachedParameter['chart'] | null = null;
  private _requestUpdate: (() => void) | null = null;

  private readonly _fillColor   = 'rgba(77, 143, 245, 0.10)';
  private readonly _strokeColor = 'rgba(77, 143, 245, 0.75)';

  attached(param: SeriesAttachedParameter<Time>): void {
    this._chart = param.chart;
    this._requestUpdate = param.requestUpdate;
  }

  detached(): void {
    this._chart = null;
    this._requestUpdate = null;
  }

  setRange(anchorA: number | null, anchorB: number | null): void {
    this._anchorA = anchorA;
    this._anchorB = anchorB;
    this._requestUpdate?.();
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return [
      new RangePaneView(
        {
          anchorA: this._anchorA,
          anchorB: this._anchorB,
          fillColor: this._fillColor,
          strokeColor: this._strokeColor,
        },
        this._chart,
      ),
    ];
  }
}

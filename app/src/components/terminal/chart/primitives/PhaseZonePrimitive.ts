/**
 * PhaseZonePrimitive.ts
 *
 * LWC v5 ISeriesPrimitive rendering phase zone background shading (Layer 1).
 * Each zone is a time-anchored colored band with a label.
 *
 * Usage:
 *   const prim = new PhaseZonePrimitive();
 *   series.attachPrimitive(prim);
 *   prim.setZones([{ from: t1, to: t2, color: 'rgba(...)' , label: 'ARCH' }]);
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

export interface PhaseZone {
  from: number;   // unix seconds
  to: number;     // unix seconds
  color: string;  // rgba fill
  label?: string;
}

class PhaseZonePaneRenderer implements IPrimitivePaneRenderer {
  private _zones: PhaseZone[];
  private _chart: SeriesAttachedParameter['chart'] | null;

  constructor(zones: PhaseZone[], chart: SeriesAttachedParameter['chart'] | null) {
    this._zones = zones;
    this._chart = chart;
  }

  draw(target: CanvasRenderingTarget2D): void {
    if (!this._chart || this._zones.length === 0) return;

    target.useBitmapCoordinateSpace((scope) => {
      const ctx = scope.context;
      const ts = this._chart!.timeScale();

      for (const zone of this._zones) {
        const xA = ts.timeToCoordinate(zone.from as unknown as Time);
        const xB = ts.timeToCoordinate(zone.to   as unknown as Time);
        if (xA === null || xB === null) continue;

        const left  = Math.min(xA, xB) * scope.horizontalPixelRatio;
        const right = Math.max(xA, xB) * scope.horizontalPixelRatio;
        const width = right - left;
        if (width < 1) continue;

        ctx.save();
        ctx.fillStyle = zone.color;
        ctx.fillRect(left, 0, width, scope.bitmapSize.height);
        ctx.restore();
      }
    });
  }
}

class PhaseZonePaneView implements IPrimitivePaneView {
  private _zones: PhaseZone[];
  private _chart: SeriesAttachedParameter['chart'] | null;

  constructor(zones: PhaseZone[], chart: SeriesAttachedParameter['chart'] | null) {
    this._zones = zones;
    this._chart = chart;
  }

  zOrder() {
    return 'bottom' as const;
  }

  renderer(): IPrimitivePaneRenderer | null {
    if (this._zones.length === 0) return null;
    return new PhaseZonePaneRenderer(this._zones, this._chart);
  }
}

export class PhaseZonePrimitive implements ISeriesPrimitive<Time> {
  private _zones: PhaseZone[] = [];
  private _chart: SeriesAttachedParameter['chart'] | null = null;
  private _requestUpdate: (() => void) | null = null;

  attached(param: SeriesAttachedParameter<Time>): void {
    this._chart = param.chart;
    this._requestUpdate = param.requestUpdate;
  }

  detached(): void {
    this._chart = null;
    this._requestUpdate = null;
  }

  setZones(zones: PhaseZone[]): void {
    this._zones = zones;
    this._requestUpdate?.();
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return [new PhaseZonePaneView(this._zones, this._chart)];
  }
}

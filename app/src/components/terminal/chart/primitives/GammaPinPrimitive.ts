/**
 * GammaPinPrimitive.ts
 *
 * LWC v5 ISeriesPrimitive that renders the Deribit options "pin" level as
 * a horizontal price line across the chart, with a small label.
 *
 * Pin level comes from /api/market/options-snapshot `gamma.pinLevel` —
 * the strike carrying the most weighted OI near ATM. Acts as a magnetic
 * price level in options-dominated markets.
 *
 * Usage:
 *   const prim = new GammaPinPrimitive({ pinLevel: 80000, direction: 'above' });
 *   series.attachPrimitive(prim);
 *   prim.update({ pinLevel: 81000, direction: 'above' });
 *   series.detachPrimitive(prim);
 */

import type {
  ISeriesPrimitive,
  SeriesAttachedParameter,
  IPrimitivePaneView,
  IPrimitivePaneRenderer,
  ISeriesApi,
  SeriesType,
  Time,
} from 'lightweight-charts';
import type { CanvasRenderingTarget2D } from 'fancy-canvas';

export interface GammaPinData {
  /** Strike price that currently acts as the pin. null hides the line. */
  pinLevel: number | null;
  /** Upside magnet (above spot) vs downside magnet (below spot). */
  direction?: 'above' | 'below' | 'at' | null;
  /** Optional — displayed alongside the label, e.g. "+3.8%" */
  distancePctLabel?: string | null;
}

function _lineColor(d: GammaPinData): string {
  switch (d.direction) {
    case 'above': return 'rgba(120, 220, 140, 0.7)';   // bull magnet
    case 'below': return 'rgba(240, 120, 120, 0.7)';   // bear magnet
    default:      return 'rgba(220, 180, 90, 0.7)';    // at-spot / neutral
  }
}

function _labelBackground(d: GammaPinData): string {
  switch (d.direction) {
    case 'above': return 'rgba(120, 220, 140, 0.25)';
    case 'below': return 'rgba(240, 120, 120, 0.25)';
    default:      return 'rgba(220, 180, 90, 0.25)';
  }
}

class GammaPinRenderer implements IPrimitivePaneRenderer {
  constructor(
    private readonly _data: GammaPinData,
    private readonly _series: ISeriesApi<SeriesType> | null,
  ) {}

  draw(target: CanvasRenderingTarget2D): void {
    const { _data, _series } = this;
    if (!_series || _data.pinLevel == null) return;

    target.useBitmapCoordinateSpace((scope) => {
      const yRaw = _series.priceToCoordinate(_data.pinLevel!);
      if (yRaw === null) return;

      const dpr = scope.verticalPixelRatio;
      const hdpr = scope.horizontalPixelRatio;
      const y = yRaw * dpr;
      const width = scope.bitmapSize.width;

      const ctx = scope.context;
      ctx.save();

      // Dashed horizontal line across the pane.
      ctx.strokeStyle = _lineColor(_data);
      ctx.lineWidth = Math.max(1, 1 * dpr);
      ctx.setLineDash([6 * hdpr, 4 * hdpr]);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Label pill on the left.
      const label = `PIN $${Math.round(_data.pinLevel!).toLocaleString()}${
        _data.distancePctLabel ? ` · ${_data.distancePctLabel}` : ''
      }`;
      ctx.font = `${10 * dpr}px ui-monospace, "JetBrains Mono", monospace`;
      const metrics = ctx.measureText(label);
      const padX = 6 * hdpr;
      const padY = 3 * dpr;
      const labelW = metrics.width + padX * 2;
      const labelH = 14 * dpr;
      const labelX = 8 * hdpr;
      const labelY = y - labelH / 2;

      ctx.fillStyle = _labelBackground(_data);
      ctx.fillRect(labelX, labelY, labelW, labelH);

      ctx.strokeStyle = _lineColor(_data);
      ctx.lineWidth = Math.max(1, 0.5 * dpr);
      ctx.strokeRect(labelX + 0.5, labelY + 0.5, labelW - 1, labelH - 1);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, labelX + padX, labelY + labelH / 2 + padY / 2);

      ctx.restore();
    });
  }
}

class GammaPinPaneView implements IPrimitivePaneView {
  constructor(
    private _data: GammaPinData,
    private _series: ISeriesApi<SeriesType> | null,
  ) {}

  zOrder() { return 'top' as const; }

  renderer(): IPrimitivePaneRenderer | null {
    if (!this._series || this._data.pinLevel == null) return null;
    return new GammaPinRenderer(this._data, this._series);
  }

  update(data: GammaPinData, series: ISeriesApi<SeriesType> | null): void {
    this._data = data;
    this._series = series;
  }
}

export class GammaPinPrimitive implements ISeriesPrimitive<Time> {
  private _data: GammaPinData;
  private _series: ISeriesApi<SeriesType> | null = null;
  private _requestUpdate: (() => void) | null = null;
  private _paneView: GammaPinPaneView;

  constructor(data: GammaPinData) {
    this._data = data;
    this._paneView = new GammaPinPaneView(data, null);
  }

  attached(param: SeriesAttachedParameter<Time>): void {
    this._series = param.series as ISeriesApi<SeriesType>;
    this._requestUpdate = param.requestUpdate;
    this._paneView.update(this._data, this._series);
  }

  detached(): void {
    this._series = null;
    this._requestUpdate = null;
  }

  update(data: GammaPinData): void {
    this._data = data;
    this._paneView.update(data, this._series);
    this._requestUpdate?.();
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return [this._paneView];
  }
}

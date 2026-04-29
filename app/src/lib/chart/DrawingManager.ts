/**
 * DrawingManager — W-0289 Chart Drawing Tools
 *
 * Manages chart drawings (trend lines, horizontal lines, fibonacci, etc.)
 * with a canvas-overlay rendering approach.
 *
 * Architecture:
 *   - Stores drawings as data ({type, points, style})
 *   - Renders into an absolutely positioned <canvas> overlay
 *   - Converts chart logical coordinates → canvas pixels on each render
 *   - Listens to chart pan/zoom to trigger re-render
 *
 * Usage:
 *   const mgr = new DrawingManager({ storageKey: 'drawings:BTCUSDT:4h' });
 *   mgr.attach(chart, series, overlayCanvas);
 *   // user clicks "Trend Line" button:
 *   mgr.setTool('trendLine');
 *   // on cleanup:
 *   mgr.detach();
 */

import type { IChartApi, ISeriesApi, SeriesType, Time } from 'lightweight-charts';

// ── Types ───────────────────────────────────────────────────────────────────

export type DrawingToolType =
  | 'cursor'
  | 'trendLine'
  | 'horizontalLine'
  | 'verticalLine'
  | 'extendedLine'
  | 'rectangle'
  | 'fibRetracement'
  | 'textLabel';

export interface DrawingPoint {
  time:  number;   // Unix seconds (logical chart time)
  price: number;   // price value
}

export interface DrawingStyle {
  color:     string;
  lineWidth: number;
  dash?:     number[];
  opacity?:  number;
}

export interface Drawing {
  id:     string;
  type:   DrawingToolType;
  points: DrawingPoint[];
  style:  DrawingStyle;
  label?: string;     // for textLabel
}

// ── FSM States ──────────────────────────────────────────────────────────────
type FSMState = 'idle' | 'drawing' | 'complete';

// ── Fib levels (TradingView standard) ───────────────────────────────────────
const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
const FIB_COLORS: Record<number, string> = {
  0:     '#787B86',
  0.236: '#F23645',
  0.382: '#FF9800',
  0.5:   '#4CAF50',
  0.618: '#089981',
  0.786: '#2196F3',
  1:     '#787B86',
};

// ── DrawingManager ────────────────────────────────────────────────────────

export class DrawingManager {
  // ── Config ──────────────────────────────────────────────────────────────
  public readonly storageKey: string;

  // ── State ────────────────────────────────────────────────────────────────
  private drawings: Drawing[] = [];
  private activeTool: DrawingToolType = 'cursor';
  private fsmState: FSMState = 'idle';
  private pendingPoints: DrawingPoint[] = [];
  private previewPoint: DrawingPoint | null = null;
  private selectedId: string | null = null;

  // ── Chart refs ───────────────────────────────────────────────────────────
  private chart:  IChartApi | null = null;
  private series: ISeriesApi<SeriesType> | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private dpr = window.devicePixelRatio || 1;

  // ── Subscriptions ────────────────────────────────────────────────────────
  private unsubscribeRange: (() => void) | null = null;
  private unsubscribeClick: (() => void) | null = null;
  private unsubscribeCross: (() => void) | null = null;

  // ── Callbacks ────────────────────────────────────────────────────────────
  /** Called when drawings change (for reactive UI update) */
  public onDrawingsChange: (() => void) | null = null;
  /** Called when active tool changes */
  public onToolChange: ((tool: DrawingToolType) => void) | null = null;

  constructor({ storageKey }: { storageKey: string }) {
    this.storageKey = storageKey;
    this.load();
  }

  // ── Public API ───────────────────────────────────────────────────────────

  /** Update the canvas element (called from DrawingCanvas.svelte after mount) */
  setCanvas(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.dpr = window.devicePixelRatio || 1;
  }

  attach(
    chart: IChartApi,
    series: ISeriesApi<SeriesType>,
    canvas?: HTMLCanvasElement,
  ) {
    this.chart  = chart;
    this.series = series;
    if (canvas) this.canvas = canvas;

    // Re-render on every visible range change (pan/zoom)
    const handleRange = () => this.render();
    this.chart.timeScale().subscribeVisibleLogicalRangeChange(handleRange);
    this.unsubscribeRange = () =>
      this.chart?.timeScale().unsubscribeVisibleLogicalRangeChange(handleRange);

    // Click → add drawing point
    const handleClick = (param: { time?: Time; point?: { x: number; y: number } }) => {
      if (this.activeTool === 'cursor') return;
      if (!param.time || !param.point) return;
      const price = this.series?.coordinateToPrice(param.point.y);
      if (price == null) return;
      this.addPoint({ time: param.time as number, price });
    };
    this.chart.subscribeClick(handleClick as Parameters<IChartApi['subscribeClick']>[0]);
    this.unsubscribeClick = () =>
      this.chart?.unsubscribeClick(handleClick as Parameters<IChartApi['unsubscribeClick']>[0]);

    // Crosshair move → preview last segment
    const handleCross = (param: { time?: Time; point?: { x: number; y: number } }) => {
      if (this.fsmState !== 'drawing' || !param.time || !param.point) {
        this.previewPoint = null;
        this.render();
        return;
      }
      const price = this.series?.coordinateToPrice(param.point.y);
      if (price == null) return;
      this.previewPoint = { time: param.time as number, price };
      this.render();
    };
    this.chart.subscribeCrosshairMove(handleCross as Parameters<IChartApi['subscribeCrosshairMove']>[0]);
    this.unsubscribeCross = () =>
      this.chart?.unsubscribeCrosshairMove(handleCross as Parameters<IChartApi['subscribeCrosshairMove']>[0]);

    this.render();
  }

  detach() {
    this.unsubscribeRange?.();
    this.unsubscribeClick?.();
    this.unsubscribeCross?.();
    this.unsubscribeRange = this.unsubscribeClick = this.unsubscribeCross = null;
    this.chart = this.series = this.canvas = null;
  }

  setTool(tool: DrawingToolType) {
    if (this.activeTool === tool) {
      // toggle off → cursor
      this.activeTool = 'cursor';
    } else {
      this.activeTool = tool;
    }
    this.fsmState = 'idle';
    this.pendingPoints = [];
    this.previewPoint = null;
    this.onToolChange?.(this.activeTool);
    this.render();
  }

  getActiveTool(): DrawingToolType { return this.activeTool; }
  getDrawings(): Drawing[] { return [...this.drawings]; }

  deleteSelected() {
    if (!this.selectedId) return;
    this.drawings = this.drawings.filter((d) => d.id !== this.selectedId);
    this.selectedId = null;
    this.save();
    this.onDrawingsChange?.();
    this.render();
  }

  clearAll() {
    this.drawings = [];
    this.selectedId = null;
    this.fsmState = 'idle';
    this.pendingPoints = [];
    this.previewPoint = null;
    this.save();
    this.onDrawingsChange?.();
    this.render();
  }

  // ── Point FSM ────────────────────────────────────────────────────────────

  private addPoint(pt: DrawingPoint) {
    this.pendingPoints.push(pt);
    this.fsmState = 'drawing';
    const needed = this.pointsNeeded(this.activeTool);

    if (this.pendingPoints.length >= needed) {
      this.commitDrawing();
    }
  }

  private pointsNeeded(tool: DrawingToolType): number {
    switch (tool) {
      case 'horizontalLine':
      case 'verticalLine':
      case 'textLabel':
        return 1;
      case 'trendLine':
      case 'extendedLine':
      case 'rectangle':
      case 'fibRetracement':
        return 2;
      default:
        return 2;
    }
  }

  private commitDrawing() {
    const defaultStyle: DrawingStyle = {
      color: '#2196F3',
      lineWidth: 1,
    };
    const drawing: Drawing = {
      id:     crypto.randomUUID(),
      type:   this.activeTool,
      points: [...this.pendingPoints],
      style:  { ...defaultStyle },
    };
    this.drawings.push(drawing);
    this.pendingPoints = [];
    this.previewPoint = null;
    this.fsmState = 'idle';
    this.save();
    this.onDrawingsChange?.();
    this.render();
  }

  // ── Coordinate helpers ────────────────────────────────────────────────────

  private toCanvasX(time: number): number | null {
    if (!this.chart) return null;
    const coord = this.chart.timeScale().timeToCoordinate(time as Time);
    return coord != null ? coord * this.dpr : null;
  }

  private toCanvasY(price: number): number | null {
    if (!this.series) return null;
    const coord = this.series.priceToCoordinate(price);
    return coord != null ? coord * this.dpr : null;
  }

  // ── Render ───────────────────────────────────────────────────────────────

  render() {
    if (!this.canvas) return;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Render committed drawings
    for (const d of this.drawings) {
      this.renderDrawing(ctx, d, d.id === this.selectedId);
    }

    // Render preview (in-progress drawing)
    if (this.fsmState === 'drawing' && this.pendingPoints.length > 0 && this.previewPoint) {
      const preview: Drawing = {
        id:     '__preview__',
        type:   this.activeTool,
        points: [...this.pendingPoints, this.previewPoint],
        style:  { color: '#2196F3', lineWidth: 1, dash: [4, 3], opacity: 0.7 },
      };
      this.renderDrawing(ctx, preview, false);
    }
  }

  private renderDrawing(ctx: CanvasRenderingContext2D, d: Drawing, selected: boolean) {
    ctx.save();
    ctx.globalAlpha = d.style.opacity ?? 1;
    ctx.strokeStyle = selected ? '#ff9800' : d.style.color;
    ctx.lineWidth   = (d.style.lineWidth) * this.dpr;
    if (d.style.dash) ctx.setLineDash(d.style.dash.map((v) => v * this.dpr));
    else ctx.setLineDash([]);

    switch (d.type) {
      case 'horizontalLine':   this.renderHLine(ctx, d); break;
      case 'verticalLine':     this.renderVLine(ctx, d); break;
      case 'trendLine':        this.renderTrendLine(ctx, d, false); break;
      case 'extendedLine':     this.renderTrendLine(ctx, d, true); break;
      case 'rectangle':        this.renderRectangle(ctx, d); break;
      case 'fibRetracement':   this.renderFib(ctx, d); break;
      case 'textLabel':        this.renderTextLabel(ctx, d); break;
    }

    ctx.restore();
  }

  private renderHLine(ctx: CanvasRenderingContext2D, d: Drawing) {
    if (!d.points[0] || !this.canvas) return;
    const y = this.toCanvasY(d.points[0].price);
    if (y == null) return;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(this.canvas.width, y);
    ctx.stroke();
    // Price label
    ctx.font = `${10 * this.dpr}px monospace`;
    ctx.fillStyle = ctx.strokeStyle as string;
    ctx.fillText(d.points[0].price.toFixed(2), 4 * this.dpr, y - 3 * this.dpr);
  }

  private renderVLine(ctx: CanvasRenderingContext2D, d: Drawing) {
    if (!d.points[0] || !this.canvas) return;
    const x = this.toCanvasX(d.points[0].time);
    if (x == null) return;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, this.canvas.height);
    ctx.stroke();
  }

  private renderTrendLine(
    ctx: CanvasRenderingContext2D,
    d: Drawing,
    extended: boolean,
  ) {
    if (d.points.length < 2 || !this.canvas) return;
    const x1 = this.toCanvasX(d.points[0].time);
    const y1 = this.toCanvasY(d.points[0].price);
    const x2 = this.toCanvasX(d.points[1].time);
    const y2 = this.toCanvasY(d.points[1].price);
    if (x1 == null || y1 == null || x2 == null || y2 == null) return;

    let startX = x1, startY = y1, endX = x2, endY = y2;

    if (extended && x1 !== x2) {
      // Extend to canvas edges
      const slope = (y2 - y1) / (x2 - x1);
      startX = 0;
      startY = y1 + slope * (0 - x1);
      endX   = this.canvas.width;
      endY   = y1 + slope * (this.canvas.width - x1);
    }

    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
  }

  private renderRectangle(ctx: CanvasRenderingContext2D, d: Drawing) {
    if (d.points.length < 2) return;
    const x1 = this.toCanvasX(d.points[0].time);
    const y1 = this.toCanvasY(d.points[0].price);
    const x2 = this.toCanvasX(d.points[1].time);
    const y2 = this.toCanvasY(d.points[1].price);
    if (x1 == null || y1 == null || x2 == null || y2 == null) return;
    const rx = Math.min(x1, x2), ry = Math.min(y1, y2);
    const rw = Math.abs(x2 - x1), rh = Math.abs(y2 - y1);
    ctx.strokeRect(rx, ry, rw, rh);
    // Fill with 10% opacity
    ctx.fillStyle = d.style.color + '1a';  // hex opacity 10%
    ctx.fillRect(rx, ry, rw, rh);
  }

  private renderFib(ctx: CanvasRenderingContext2D, d: Drawing) {
    if (d.points.length < 2 || !this.canvas) return;
    const highPrice = Math.max(d.points[0].price, d.points[1].price);
    const lowPrice  = Math.min(d.points[0].price, d.points[1].price);
    const range = highPrice - lowPrice;

    const x1 = this.toCanvasX(d.points[0].time);
    const x2 = this.toCanvasX(d.points[1].time);
    if (x1 == null || x2 == null) return;
    const lineLeft  = Math.min(x1, x2);
    const lineRight = Math.max(x1, x2);

    for (const level of FIB_LEVELS) {
      const price = lowPrice + range * (1 - level);
      const y = this.toCanvasY(price);
      if (y == null) continue;

      ctx.strokeStyle = FIB_COLORS[level] ?? '#888';
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(lineLeft, y);
      ctx.lineTo(lineRight, y);
      ctx.stroke();

      // Label
      ctx.font = `${9 * this.dpr}px monospace`;
      ctx.fillStyle = FIB_COLORS[level] ?? '#888';
      ctx.fillText(
        `${(level * 100).toFixed(1)}%  ${price.toFixed(2)}`,
        lineLeft + 2 * this.dpr,
        y - 2 * this.dpr,
      );
    }
  }

  private renderTextLabel(ctx: CanvasRenderingContext2D, d: Drawing) {
    if (!d.points[0] || !d.label) return;
    const x = this.toCanvasX(d.points[0].time);
    const y = this.toCanvasY(d.points[0].price);
    if (x == null || y == null) return;
    ctx.font = `bold ${11 * this.dpr}px sans-serif`;
    ctx.fillStyle = d.style.color;
    ctx.fillText(d.label, x, y);
  }

  // ── Persistence ──────────────────────────────────────────────────────────

  private save() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.drawings));
    } catch { /* quota exceeded — ignore */ }
  }

  private load() {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (raw) this.drawings = JSON.parse(raw) as Drawing[];
    } catch {
      this.drawings = [];
    }
  }
}

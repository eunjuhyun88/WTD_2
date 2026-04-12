// ═══════════════════════════════════════════════════════════════
// Stockclaw — Chart Overlay Renderer (Canvas Orchestration)
// ═══════════════════════════════════════════════════════════════
// This layer decides what the overlay canvas should render, while
// delegating primitive drawing to chartDrawingEngine.ts.

import type { AgentTradeSetup, DrawingItem, DrawingMode } from '$lib/chart/chartTypes';
import type { ChartPatternDetection } from '$lib/engine/patternDetector';
import type { ChartTheme } from '../ChartTheme';
import {
  computeTradePreview,
  drawAgentTradeOverlay,
  drawDrawingItems,
  drawPatternOverlays,
  drawTradePreview,
  type AgentCloseBtn,
  type CoordProvider,
  type TradePreview,
} from './chartDrawingEngine';
import type { TradePreviewDraft, TrendlineDraft } from './chartDrawingSession';

export function isTradePreviewMode(
  mode: DrawingMode,
): mode is Extract<DrawingMode, 'longentry' | 'shortentry' | 'trade'> {
  return mode === 'longentry' || mode === 'shortentry' || mode === 'trade';
}

export function resolveTradePreview(options: {
  tradePreview: TradePreviewDraft | null;
  drawingMode: DrawingMode;
  cursor?: { x: number; y: number };
  canvasW: number;
  canvasH: number;
  coord: Pick<CoordProvider, 'toChartPrice' | 'toChartY'>;
  livePrice: number;
}): TradePreview | null {
  if (!options.tradePreview || !isTradePreviewMode(options.drawingMode)) return null;

  return computeTradePreview(
    options.tradePreview.mode,
    options.tradePreview.startX,
    options.tradePreview.startY,
    options.cursor?.x ?? options.tradePreview.cursorX,
    options.cursor?.y ?? options.tradePreview.cursorY,
    options.canvasW,
    options.canvasH,
    options.coord,
    options.livePrice,
  );
}

export function renderChartOverlay(options: {
  ctx: CanvasRenderingContext2D;
  canvasW: number;
  canvasH: number;
  chartMode: 'agent' | 'trading';
  overlayPatterns: ChartPatternDetection[];
  activeTradeSetup: AgentTradeSetup | null;
  drawingsVisible: boolean;
  drawings: DrawingItem[];
  drawingMode: DrawingMode;
  tradePreview: TradePreviewDraft | null;
  chartTheme: ChartTheme;
  livePrice: number;
  coord: Pick<
    CoordProvider,
    'toChartX' | 'toChartY' | 'toChartPrice' | 'toOverlayPoint'
  >;
}): { agentCloseBtn: AgentCloseBtn | null } {
  const {
    ctx,
    canvasW,
    canvasH,
    chartMode,
    overlayPatterns,
    activeTradeSetup,
    drawingsVisible,
    drawings,
    drawingMode,
    tradePreview,
    chartTheme,
    livePrice,
    coord,
  } = options;

  ctx.clearRect(0, 0, canvasW, canvasH);

  if (chartMode === 'agent' && overlayPatterns.length > 0) {
    drawPatternOverlays(ctx, overlayPatterns, canvasW, canvasH, {
      toOverlayPoint: coord.toOverlayPoint,
    });
  }

  let agentCloseBtn: AgentCloseBtn | null = null;
  if (activeTradeSetup && drawingsVisible) {
    agentCloseBtn = drawAgentTradeOverlay(
      ctx,
      activeTradeSetup,
      canvasW,
      { toChartY: coord.toChartY },
      chartTheme,
      livePrice,
    );
  }

  const preview = resolveTradePreview({
    tradePreview,
    drawingMode,
    canvasW,
    canvasH,
    coord: { toChartPrice: coord.toChartPrice, toChartY: coord.toChartY },
    livePrice,
  });

  if (!drawingsVisible) {
    if (preview) drawTradePreview(ctx, preview, chartTheme, canvasW);
    return { agentCloseBtn };
  }

  drawDrawingItems(
    ctx,
    drawings,
    { toChartX: coord.toChartX, toChartY: coord.toChartY },
    chartTheme,
  );

  if (preview) drawTradePreview(ctx, preview, chartTheme, canvasW);
  return { agentCloseBtn };
}

export function drawTrendlineGhost(
  ctx: CanvasRenderingContext2D,
  draft: TrendlineDraft,
  cursor: { x: number; y: number },
  ghostColor: string,
): void {
  const startPoint = draft.points[0];
  if (!startPoint) return;

  ctx.save();
  ctx.beginPath();
  ctx.strokeStyle = ghostColor;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.moveTo(startPoint.x, startPoint.y);
  ctx.lineTo(cursor.x, cursor.y);
  ctx.stroke();
  ctx.restore();
}

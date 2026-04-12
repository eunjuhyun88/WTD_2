// ═══════════════════════════════════════════════════════════════
// Stockclaw — Chart Drawing Session Helpers (Pure State)
// ═══════════════════════════════════════════════════════════════
// Extracted from ChartPanel.svelte. These helpers manage drawing
// session state transitions and item creation without side effects.

import {
  buildLineEntryTradeDraft,
  buildTradePlanDraftFromPreview,
} from '$lib/chart/chartTradePlanner';
import { clampRoundPrice } from '$lib/chart/chartCoordinates';
import type {
  DrawingAnchorPoint,
  DrawingItem,
  DrawingMode,
  TradePlanDraft,
} from '$lib/chart/chartTypes';
import type { TradePreview } from './chartDrawingEngine';

export interface TrendlineDraft {
  type: 'trendline';
  points: Array<{ x: number; y: number }>;
}

export interface TradePreviewDraft {
  mode: 'longentry' | 'shortentry' | 'trade';
  startX: number;
  startY: number;
  cursorX: number;
  cursorY: number;
}

export interface LineTradeDraft {
  pair: string;
  dir: 'LONG' | 'SHORT';
  entry: number;
  sl: number;
  tp: number;
  rr: number;
}

export interface FinalizedTradePreview {
  drawings: DrawingItem[];
  pendingTradePlan: TradePlanDraft | null;
  lineTrade: LineTradeDraft | null;
}

export function appendDrawingWithLimit(
  drawings: DrawingItem[],
  nextDrawing: DrawingItem,
  maxDrawings: number,
): DrawingItem[] {
  const next = [...drawings, nextDrawing];
  return next.length > maxDrawings ? next.slice(-maxDrawings) : next;
}

export function buildHorizontalLineDrawing(options: {
  y: number;
  width: number;
  linePrice: number | null;
  color: string;
}): DrawingItem {
  return {
    type: 'hline',
    points: [{ x: 0, y: options.y }, { x: options.width, y: options.y }],
    price: options.linePrice == null ? undefined : clampRoundPrice(options.linePrice),
    color: options.color,
  };
}

export function startTrendlineDraft(x: number, y: number): TrendlineDraft {
  return { type: 'trendline', points: [{ x, y }] };
}

export function completeTrendlineDraft(options: {
  draft: TrendlineDraft;
  endPoint: { x: number; y: number };
  startAnchor: DrawingAnchorPoint | null;
  endAnchor: DrawingAnchorPoint | null;
  color: string;
}): DrawingItem {
  return {
    type: 'trendline',
    points: [...options.draft.points, options.endPoint],
    anchors: options.startAnchor && options.endAnchor
      ? [options.startAnchor, options.endAnchor]
      : undefined,
    color: options.color,
  };
}

export function startTradePreviewDraft(
  mode: Extract<DrawingMode, 'longentry' | 'shortentry' | 'trade'>,
  x: number,
  y: number,
): TradePreviewDraft {
  return { mode, startX: x, startY: y, cursorX: x, cursorY: y };
}

export function updateTradePreviewDraft(
  preview: TradePreviewDraft,
  x: number,
  y: number,
): TradePreviewDraft {
  return { ...preview, cursorX: x, cursorY: y };
}

export function finalizeTradePreview(options: {
  drawings: DrawingItem[];
  nextDrawing: DrawingItem;
  preview: TradePreview;
  pair: string;
  requireTradeConfirm: boolean;
  maxDrawings: number;
}): FinalizedTradePreview {
  const drawings = appendDrawingWithLimit(options.drawings, options.nextDrawing, options.maxDrawings);
  const pair = options.pair || 'BTC/USDT';

  if (options.requireTradeConfirm) {
    return {
      drawings,
      pendingTradePlan: buildTradePlanDraftFromPreview(options.preview, pair),
      lineTrade: null,
    };
  }

  const lineTrade = buildLineEntryTradeDraft({
    pair,
    dir: options.preview.dir,
    entry: options.preview.entry,
    stopHint: options.preview.sl,
    rr: options.preview.rr,
  });

  return {
    drawings,
    pendingTradePlan: null,
    lineTrade,
  };
}

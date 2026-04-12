// ═══════════════════════════════════════════════════════════════
// Stockclaw — Chart Drawing Engine (Canvas Rendering)
// ═══════════════════════════════════════════════════════════════
// Extracted from ChartPanel.svelte. All functions accept explicit
// parameters — no component state references.

import type { ChartTheme } from '../ChartTheme';
import { withAlpha } from '../ChartTheme';
import { formatPrice, clampRoundPrice } from '$lib/chart/chartCoordinates';
import { clampToCanvas } from '$lib/chart/chartHelpers';
import { LINE_ENTRY_DEFAULT_RR, LINE_ENTRY_MIN_PIXEL_RISK } from '$lib/chart/chartIndicators';
import type { AgentTradeSetup, DrawingItem } from '$lib/chart/chartTypes';
import type { ChartPatternDetection } from '$lib/engine/patternDetector';

// ── Coordinate Converter Interface ──────────────────────────
// ChartPanel provides these closures over its series/chart refs.

export interface CoordProvider {
  toChartX: (time: number) => number | null;
  toChartY: (price: number) => number | null;
  toChartPrice: (y: number) => number | null;
  toChartTime: (x: number) => number | null;
  toOverlayPoint: (time: number, price: number) => { x: number; y: number } | null;
}

// ── Canvas Utility ──────────────────────────────────────────

export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ── Trade Preview Data ──────────────────────────────────────

export interface TradePreview {
  mode: 'longentry' | 'shortentry';
  dir: 'LONG' | 'SHORT';
  left: number;
  right: number;
  entryY: number;
  slY: number;
  tpY: number;
  entry: number;
  sl: number;
  tp: number;
  rr: number;
  riskPct: number;
}

// ── Compute Trade Preview ───────────────────────────────────

export function computeTradePreview(
  mode: 'longentry' | 'shortentry' | 'trade',
  startX: number, startY: number,
  cursorX: number, cursorY: number,
  canvasW: number, canvasH: number,
  coord: Pick<CoordProvider, 'toChartPrice' | 'toChartY'>,
  livePrice: number,
): TradePreview | null {
  const sx = clampToCanvas(startX, canvasW);
  const sy = clampToCanvas(startY, canvasH);
  const cx = clampToCanvas(cursorX, canvasW);
  const cy = clampToCanvas(cursorY, canvasH);

  const left = Math.min(sx, cx);
  const right = Math.min(canvasW, Math.max(sx, cx, left + 26));
  const entryY = sy;
  let slY = cy;
  let tpY = cy;

  const effectiveMode: 'longentry' | 'shortentry' =
    mode === 'trade'
      ? (cy >= entryY ? 'longentry' : 'shortentry')
      : mode;

  if (effectiveMode === 'longentry') {
    slY = Math.max(cy, entryY + LINE_ENTRY_MIN_PIXEL_RISK);
    tpY = entryY - (slY - entryY) * LINE_ENTRY_DEFAULT_RR;
  } else {
    slY = Math.min(cy, entryY - LINE_ENTRY_MIN_PIXEL_RISK);
    tpY = entryY + (entryY - slY) * LINE_ENTRY_DEFAULT_RR;
  }

  const entryRaw = coord.toChartPrice(entryY);
  const fallbackEntry = Number.isFinite(livePrice) && livePrice > 0 ? livePrice : null;
  if (entryRaw == null && fallbackEntry == null) return null;
  const entryPx = clampRoundPrice(entryRaw ?? fallbackEntry!);

  const slRaw = coord.toChartPrice(slY);
  let slPx = 0;
  if (slRaw != null) {
    slPx = clampRoundPrice(slRaw);
  } else {
    const pxDelta = Math.max(LINE_ENTRY_MIN_PIXEL_RISK, Math.abs(slY - entryY));
    const approxRisk = Math.max(0.0035, Math.min(0.08, (pxDelta / Math.max(120, canvasH)) * 0.24));
    slPx = clampRoundPrice(effectiveMode === 'longentry' ? entryPx * (1 - approxRisk) : entryPx * (1 + approxRisk));
  }
  if (effectiveMode === 'longentry' && slPx >= entryPx) slPx = clampRoundPrice(entryPx * 0.995);
  if (effectiveMode === 'shortentry' && slPx <= entryPx) slPx = clampRoundPrice(entryPx * 1.005);
  const risk = Math.abs(entryPx - slPx);
  if (!Number.isFinite(risk) || risk <= 0) return null;
  const tpPx = clampRoundPrice(effectiveMode === 'longentry' ? entryPx + risk * LINE_ENTRY_DEFAULT_RR : entryPx - risk * LINE_ENTRY_DEFAULT_RR);

  const mappedEntryY = coord.toChartY(entryPx);
  const mappedSlY = coord.toChartY(slPx);
  const mappedTpY = coord.toChartY(tpPx);
  if (mappedSlY != null) slY = mappedSlY;
  tpY = mappedTpY ?? tpY;
  const normalizedEntryY = mappedEntryY ?? entryY;

  const riskPct = Math.abs(entryPx - slPx) / Math.max(Math.abs(entryPx), 1) * 100;

  return {
    mode: effectiveMode,
    dir: effectiveMode === 'longentry' ? 'LONG' : 'SHORT',
    left,
    right,
    entryY: normalizedEntryY,
    slY,
    tpY,
    entry: entryPx,
    sl: slPx,
    tp: tpPx,
    rr: LINE_ENTRY_DEFAULT_RR,
    riskPct,
  };
}

// ── Draw Trade Preview ──────────────────────────────────────

export function drawTradePreview(
  ctx: CanvasRenderingContext2D,
  preview: TradePreview,
  theme: ChartTheme,
  canvasW: number,
): void {
  const lossTop = Math.min(preview.entryY, preview.slY);
  const lossBottom = Math.max(preview.entryY, preview.slY);
  const gainTop = Math.min(preview.entryY, preview.tpY);
  const gainBottom = Math.max(preview.entryY, preview.tpY);

  ctx.save();
  ctx.fillStyle = withAlpha(theme.candleUp, 0.17);
  ctx.fillRect(preview.left, gainTop, preview.right - preview.left, gainBottom - gainTop);
  ctx.fillStyle = withAlpha(theme.candleDown, 0.17);
  ctx.fillRect(preview.left, lossTop, preview.right - preview.left, lossBottom - lossTop);

  ctx.lineWidth = 1.2;
  ctx.setLineDash([5, 4]);
  ctx.strokeStyle = withAlpha(theme.entry, 0.92);
  ctx.beginPath();
  ctx.moveTo(preview.left, preview.entryY);
  ctx.lineTo(preview.right, preview.entryY);
  ctx.stroke();

  ctx.strokeStyle = withAlpha(theme.sl, 0.9);
  ctx.beginPath();
  ctx.moveTo(preview.left, preview.slY);
  ctx.lineTo(preview.right, preview.slY);
  ctx.stroke();

  ctx.strokeStyle = withAlpha(theme.tp, 0.9);
  ctx.beginPath();
  ctx.moveTo(preview.left, preview.tpY);
  ctx.lineTo(preview.right, preview.tpY);
  ctx.stroke();
  ctx.setLineDash([]);

  const label = `${preview.dir} · E ${formatPrice(preview.entry)} · TP ${formatPrice(preview.tp)} · SL ${formatPrice(preview.sl)} · RR 1:${preview.rr.toFixed(1)} · Risk ${preview.riskPct.toFixed(2)}%`;
  ctx.font = "10px 'JetBrains Mono', monospace";
  const textW = ctx.measureText(label).width;
  const padX = 7;
  const boxW = textW + padX * 2;
  const boxH = 16;
  const boxX = Math.max(4, Math.min(preview.right + 8, canvasW - boxW - 4));
  const boxY = Math.max(4, Math.min(preview.entryY - boxH - 4, ctx.canvas.height - boxH - 4));

  ctx.fillStyle = withAlpha('#000000', 0.68);
  ctx.fillRect(boxX, boxY, boxW, boxH);
  ctx.strokeStyle = withAlpha(preview.dir === 'LONG' ? theme.candleUp : theme.candleDown, 0.9);
  ctx.strokeRect(boxX, boxY, boxW, boxH);
  ctx.fillStyle = withAlpha('#f5f7fa', 0.95);
  ctx.fillText(label, boxX + padX, boxY + 11);
  ctx.restore();
}

// ── Persisted Drawing Items ─────────────────────────────────

export function drawDrawingItems(
  ctx: CanvasRenderingContext2D,
  drawings: DrawingItem[],
  coord: Pick<CoordProvider, 'toChartX' | 'toChartY'>,
  theme: ChartTheme,
): void {
  for (const drawing of drawings) {
    ctx.beginPath();
    ctx.strokeStyle = drawing.color;
    ctx.lineWidth = 1.5;

    if (drawing.type === 'hline') {
      const mappedY = Number.isFinite(drawing.price) ? coord.toChartY(drawing.price as number) : null;
      const y = mappedY ?? drawing.points[0]?.y;
      if (!Number.isFinite(y)) continue;
      ctx.setLineDash([6, 3]);
      ctx.moveTo(0, y);
      ctx.lineTo(ctx.canvas.width, y);
    } else if (drawing.type === 'trendline' && drawing.points.length === 2) {
      const mappedFrom = drawing.anchors?.[0]
        ? { x: coord.toChartX(drawing.anchors[0].time), y: coord.toChartY(drawing.anchors[0].price) }
        : null;
      const mappedTo = drawing.anchors?.[1]
        ? { x: coord.toChartX(drawing.anchors[1].time), y: coord.toChartY(drawing.anchors[1].price) }
        : null;
      const from = mappedFrom && mappedFrom.x !== null && mappedFrom.y !== null
        ? { x: mappedFrom.x, y: mappedFrom.y }
        : drawing.points[0];
      const to = mappedTo && mappedTo.x !== null && mappedTo.y !== null
        ? { x: mappedTo.x, y: mappedTo.y }
        : drawing.points[1];
      if (!from || !to) continue;
      ctx.setLineDash([]);
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
    } else if (drawing.type === 'tradebox' && drawing.points.length >= 4) {
      const mappedLeftX = Number.isFinite(drawing.fromTime) ? coord.toChartX(drawing.fromTime as number) : null;
      const mappedRightX = Number.isFinite(drawing.toTime) ? coord.toChartX(drawing.toTime as number) : null;
      const mappedEntryY = coord.toChartY(drawing.entry);
      const mappedSlY = coord.toChartY(drawing.sl);
      const mappedTpY = coord.toChartY(drawing.tp);
      const preview: TradePreview = (
        mappedLeftX !== null
        && mappedRightX !== null
        && mappedEntryY !== null
        && mappedSlY !== null
        && mappedTpY !== null
      )
        ? {
            mode: drawing.dir === 'LONG' ? 'longentry' : 'shortentry',
            dir: drawing.dir,
            left: Math.min(mappedLeftX, mappedRightX),
            right: Math.max(mappedLeftX, mappedRightX),
            entryY: mappedEntryY,
            slY: mappedSlY,
            tpY: mappedTpY,
            entry: drawing.entry,
            sl: drawing.sl,
            tp: drawing.tp,
            rr: drawing.rr,
            riskPct: drawing.riskPct,
          }
        : {
            mode: drawing.dir === 'LONG' ? 'longentry' : 'shortentry',
            dir: drawing.dir,
            left: Math.min(drawing.points[0].x, drawing.points[1].x),
            right: Math.max(drawing.points[0].x, drawing.points[1].x),
            entryY: drawing.points[0].y,
            slY: drawing.points[2].y,
            tpY: drawing.points[3].y,
            entry: drawing.entry,
            sl: drawing.sl,
            tp: drawing.tp,
            rr: drawing.rr,
            riskPct: drawing.riskPct,
          };
      drawTradePreview(ctx, preview, theme, ctx.canvas.width);
      continue;
    } else {
      continue;
    }

    ctx.stroke();
    ctx.setLineDash([]);
  }
}

// ── Agent Trade Overlay ─────────────────────────────────────

export interface AgentCloseBtn {
  x: number;
  y: number;
  r: number;
}

/**
 * Draw TradingView-style TP/SL zones for agent trade setup.
 * Returns the close button hit area position.
 */
export function drawAgentTradeOverlay(
  ctx: CanvasRenderingContext2D,
  setup: AgentTradeSetup,
  canvasW: number,
  coord: Pick<CoordProvider, 'toChartY'>,
  theme: ChartTheme,
  livePrice: number,
): AgentCloseBtn | null {
  const rawEntryY = coord.toChartY(setup.entry);
  const rawTpY = coord.toChartY(setup.tp);
  const rawSlY = coord.toChartY(setup.sl);
  if (rawEntryY === null || rawTpY === null || rawSlY === null) return null;

  const rightPad = 72;
  const R = canvasW - rightPad;
  const isLong = setup.dir === 'LONG';
  const tpPct = ((Math.abs(setup.tp - setup.entry) / setup.entry) * 100).toFixed(1);
  const slPct = ((Math.abs(setup.entry - setup.sl) / setup.entry) * 100).toFixed(1);

  const MIN_ZONE = 22;
  const entryY = rawEntryY;
  let tpY = rawTpY;
  let slY = rawSlY;
  if (Math.abs(tpY - entryY) < MIN_ZONE) tpY = isLong ? entryY - MIN_ZONE : entryY + MIN_ZONE;
  if (Math.abs(slY - entryY) < MIN_ZONE) slY = isLong ? entryY + MIN_ZONE : entryY - MIN_ZONE;

  ctx.save();

  const GREEN = theme.candleUp;
  const RED = theme.candleDown;
  const ACCENT = '#E8967D';
  const BG_DARK = 'rgba(10,9,8,';
  const TEXT = '#F0EDE4';

  const tpTop = Math.min(entryY, tpY);
  const tpH = Math.abs(tpY - entryY);
  ctx.fillStyle = withAlpha(GREEN, 0.10);
  ctx.fillRect(0, tpTop, R, tpH);
  ctx.strokeStyle = withAlpha(GREEN, 0.5);
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(0, tpY);
  ctx.lineTo(R, tpY);
  ctx.stroke();
  ctx.setLineDash([]);

  const slTop = Math.min(entryY, slY);
  const slH = Math.abs(slY - entryY);
  ctx.fillStyle = withAlpha(RED, 0.10);
  ctx.fillRect(0, slTop, R, slH);
  ctx.strokeStyle = withAlpha(RED, 0.5);
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(0, slY);
  ctx.lineTo(R, slY);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.strokeStyle = withAlpha(ACCENT, 0.7);
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(0, entryY);
  ctx.lineTo(R, entryY);
  ctx.stroke();
  ctx.setLineDash([]);

  const tagW = rightPad - 2;
  const tagH = 16;
  const tagX = R + 1;
  ctx.font = "bold 9px 'JetBrains Mono', monospace";
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';

  ctx.fillStyle = withAlpha(GREEN, 0.85);
  roundRect(ctx, tagX, tpY - tagH / 2, tagW, tagH, 2);
  ctx.fill();
  ctx.fillStyle = TEXT;
  ctx.fillText(formatPrice(setup.tp), tagX + tagW / 2, tpY);

  ctx.fillStyle = withAlpha(ACCENT, 0.85);
  roundRect(ctx, tagX, entryY - tagH / 2, tagW, tagH, 2);
  ctx.fill();
  ctx.fillStyle = TEXT;
  ctx.fillText(formatPrice(setup.entry), tagX + tagW / 2, entryY);

  ctx.fillStyle = withAlpha(RED, 0.85);
  roundRect(ctx, tagX, slY - tagH / 2, tagW, tagH, 2);
  ctx.fill();
  ctx.fillStyle = TEXT;
  ctx.fillText(formatPrice(setup.sl), tagX + tagW / 2, slY);
  ctx.textAlign = 'left';

  ctx.font = "700 9px 'JetBrains Mono', monospace";
  ctx.textBaseline = 'middle';

  const tpZoneMid = tpTop + tpH / 2;
  const tpLabel = `TP +${tpPct}%`;
  const tpLabelW = ctx.measureText(tpLabel).width;
  ctx.fillStyle = `${BG_DARK}0.7)`;
  roundRect(ctx, 8, tpZoneMid - 8, tpLabelW + 12, 16, 3);
  ctx.fill();
  ctx.fillStyle = GREEN;
  ctx.fillText(tpLabel, 14, tpZoneMid);

  const slZoneMid = slTop + slH / 2;
  const slLabel = `SL -${slPct}%`;
  const slLabelW = ctx.measureText(slLabel).width;
  ctx.fillStyle = `${BG_DARK}0.7)`;
  roundRect(ctx, 8, slZoneMid - 8, slLabelW + 12, 16, 3);
  ctx.fill();
  ctx.fillStyle = RED;
  ctx.fillText(slLabel, 14, slZoneMid);

  const srcLabel = setup.source === 'consensus' ? 'CONSENSUS' : (setup.agentName?.toUpperCase() ?? 'AGENT');
  const dirArrow = isLong ? '▲' : '▼';
  ctx.font = "800 9px 'JetBrains Mono', monospace";
  const eLabelH = 16;
  const eLabelY = entryY - eLabelH - 4;
  let curX = 8;

  const b1Text = `${dirArrow} ${srcLabel} ${setup.dir}`;
  const b1W = ctx.measureText(b1Text).width + 12;
  ctx.fillStyle = withAlpha(isLong ? GREEN : RED, 0.8);
  roundRect(ctx, curX, eLabelY, b1W, eLabelH, 3);
  ctx.fill();
  ctx.fillStyle = TEXT;
  ctx.textBaseline = 'middle';
  ctx.fillText(b1Text, curX + 6, eLabelY + eLabelH / 2);
  curX += b1W + 3;

  const b2Text = `R:R 1:${setup.rr.toFixed(1)}`;
  const b2W = ctx.measureText(b2Text).width + 12;
  ctx.fillStyle = `${BG_DARK}0.75)`;
  roundRect(ctx, curX, eLabelY, b2W, eLabelH, 3);
  ctx.fill();
  ctx.strokeStyle = withAlpha(ACCENT, 0.25);
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = withAlpha(TEXT, 0.85);
  ctx.fillText(b2Text, curX + 6, eLabelY + eLabelH / 2);
  curX += b2W + 3;

  const b3Text = `${setup.conf}%`;
  const b3W = ctx.measureText(b3Text).width + 12;
  ctx.fillStyle = `${BG_DARK}0.75)`;
  roundRect(ctx, curX, eLabelY, b3W, eLabelH, 3);
  ctx.fill();
  ctx.strokeStyle = withAlpha(ACCENT, 0.25);
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = withAlpha(isLong ? GREEN : RED, 0.85);
  ctx.fillText(b3Text, curX + 6, eLabelY + eLabelH / 2);
  curX += b3W + 3;

  if (livePrice > 0) {
    const pnl = isLong
      ? ((livePrice - setup.entry) / setup.entry) * 100
      : ((setup.entry - livePrice) / setup.entry) * 100;
    const pnlColor = pnl >= 0 ? GREEN : RED;
    const pnlText = `${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}%`;
    const b4W = ctx.measureText(pnlText).width + 12;
    ctx.fillStyle = withAlpha(pnlColor, 0.75);
    roundRect(ctx, curX, eLabelY, b4W, eLabelH, 3);
    ctx.fill();
    ctx.fillStyle = TEXT;
    ctx.fillText(pnlText, curX + 6, eLabelY + eLabelH / 2);
  }

  ctx.restore();

  return { x: R - 14, y: tpTop + 14, r: 14 };
}

// ── Pattern Tag ─────────────────────────────────────────────

export function drawPatternTag(
  ctx: CanvasRenderingContext2D,
  point: { x: number; y: number },
  text: string,
  color: string,
  canvasW: number,
  canvasH: number,
): void {
  ctx.save();
  ctx.font = "700 9px 'JetBrains Mono', monospace";
  const padX = 6;
  const h = 16;
  const w = Math.ceil(ctx.measureText(text).width) + padX * 2;
  const x = Math.max(4, Math.min(point.x + 8, canvasW - w - 4));
  const y = Math.max(4, Math.min(point.y - h - 8, canvasH - h - 4));

  ctx.fillStyle = withAlpha('#05070d', 0.84);
  ctx.strokeStyle = withAlpha(color, 0.72);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = withAlpha(color, 0.96);
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + padX, y + h / 2);
  ctx.restore();
}

// ── Pattern Overlays ────────────────────────────────────────

export function drawPatternOverlays(
  ctx: CanvasRenderingContext2D,
  patterns: ChartPatternDetection[],
  canvasW: number,
  canvasH: number,
  coord: Pick<CoordProvider, 'toOverlayPoint'>,
): void {
  if (patterns.length === 0) return;

  for (const pattern of patterns) {
    const lineAlpha = 0.9;
    const fillAlpha = 0.14;

    const upperGuide = pattern.guideLines.find((g) => g.label === 'upper');
    const lowerGuide = pattern.guideLines.find((g) => g.label === 'lower');
    if (upperGuide && lowerGuide) {
      const p1 = coord.toOverlayPoint(upperGuide.from.time, upperGuide.from.price);
      const p2 = coord.toOverlayPoint(upperGuide.to.time, upperGuide.to.price);
      const p3 = coord.toOverlayPoint(lowerGuide.to.time, lowerGuide.to.price);
      const p4 = coord.toOverlayPoint(lowerGuide.from.time, lowerGuide.from.price);
      if (p1 && p2 && p3 && p4) {
        ctx.save();
        ctx.fillStyle = withAlpha(upperGuide.color, fillAlpha);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.lineTo(p3.x, p3.y);
        ctx.lineTo(p4.x, p4.y);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }

    for (const guide of pattern.guideLines) {
      const from = coord.toOverlayPoint(guide.from.time, guide.from.price);
      const to = coord.toOverlayPoint(guide.to.time, guide.to.price);
      if (!from || !to) continue;

      ctx.save();
      ctx.strokeStyle = withAlpha(guide.color, lineAlpha);
      ctx.lineWidth = guide.style === 'dashed' ? 2 : 2.2;
      ctx.setLineDash(guide.style === 'dashed' ? [7, 5] : []);
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = withAlpha(guide.color, 0.95);
      ctx.beginPath();
      ctx.arc(from.x, from.y, 2.2, 0, Math.PI * 2);
      ctx.arc(to.x, to.y, 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    const marker = coord.toOverlayPoint(pattern.markerTime, pattern.markerPrice);
    if (!marker) continue;
    const tagColor = pattern.direction === 'BULLISH' ? '#58d78d' : '#ff657a';
    const statusLabel = pattern.status === 'CONFIRMED' ? 'OK' : 'PEND';
    drawPatternTag(
      ctx,
      marker,
      `${pattern.shortName} ${statusLabel} ${Math.round(pattern.confidence * 100)}%`,
      tagColor,
      canvasW,
      canvasH,
    );
  }
}

// ── Make Trade Box Drawing ──────────────────────────────────

export function makeTradeBoxDrawing(
  preview: TradePreview,
  toChartTime: (x: number) => number | null,
  theme: ChartTheme,
): DrawingItem {
  const leftTime = toChartTime(preview.left);
  const rightTime = toChartTime(preview.right);
  const fromTime = leftTime !== null && rightTime !== null ? Math.min(leftTime, rightTime) : undefined;
  const toTime = leftTime !== null && rightTime !== null ? Math.max(leftTime, rightTime) : undefined;
  return {
    type: 'tradebox',
    points: [
      { x: preview.left, y: preview.entryY },
      { x: preview.right, y: preview.entryY },
      { x: preview.left, y: preview.slY },
      { x: preview.left, y: preview.tpY },
    ],
    fromTime,
    toTime,
    color: preview.dir === 'LONG' ? theme.candleUp : theme.candleDown,
    dir: preview.dir,
    entry: preview.entry,
    sl: preview.sl,
    tp: preview.tp,
    rr: preview.rr,
    riskPct: preview.riskPct,
  };
}

// Store for AI analysis results → chart overlay shapes.
//
// Subscribers (chart pane) render structured shapes (price lines, range boxes,
// arrows, annotations) produced by AI panels and chart agents. Replacing the
// value fully replaces the visible overlay — there is no incremental merge.
//
// D-5 extends the original line-only shape with multi-kind shapes. The
// `lines` array is preserved for backward compatibility with existing
// PriceLineManager.setAILines callers.
import { writable } from 'svelte/store';

// ── Shape definitions ──────────────────────────────────────────────────────

export interface AIPriceLine {
  kind?: 'line';
  price: number;
  color: string;
  label: string;
  style: 'solid' | 'dashed';
}

export interface AIRangeBox {
  kind: 'range';
  fromTime: number;
  toTime: number;
  fromPrice: number;
  toPrice: number;
  color: string;
  label?: string;
}

export interface AIArrow {
  kind: 'arrow';
  fromTime: number;
  toTime: number;
  fromPrice: number;
  toPrice: number;
  color: string;
  label?: string;
}

export interface AIAnnotation {
  kind: 'annotation';
  time: number;
  price: number;
  text: string;
  color: string;
}

export type AIOverlayShape = AIPriceLine | AIRangeBox | AIArrow | AIAnnotation;

export interface AIOverlayState {
  symbol: string | null;
  lines: AIPriceLine[];
  shapes: AIOverlayShape[];
}

const _store = writable<AIOverlayState>({ lines: [], shapes: [], symbol: null });

export const chartAIOverlay = { subscribe: _store.subscribe };

/** Backward-compat: set price lines. Also mirrors them into `shapes`. */
export function setAIOverlay(symbol: string, lines: AIPriceLine[]): void {
  _store.set({
    symbol,
    lines,
    shapes: lines.map((l) => ({ ...l, kind: 'line' as const })),
  });
}

/** D-5: set the full multi-kind overlay shape list. */
export function setAIOverlayShapes(symbol: string, shapes: AIOverlayShape[]): void {
  const lines = shapes.filter(
    (s): s is AIPriceLine => !s.kind || s.kind === 'line',
  );
  _store.set({ symbol, lines, shapes });
}

export function clearAIOverlay(): void {
  _store.set({ lines: [], shapes: [], symbol: null });
}

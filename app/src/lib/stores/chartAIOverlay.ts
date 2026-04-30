// Store for AI analysis results → chart price lines.
//
// Subscribers (chart pane) render structured price lines (Entry / Stop / etc.)
// produced by the AI panel's ANALYZE handler. Replacing the value fully replaces
// the visible overlay — there is no incremental merge.
import { writable } from 'svelte/store';

export interface AIPriceLine {
  price: number;
  color: string;
  label: string;
  style: 'solid' | 'dashed';
}

export interface AIOverlayState {
  lines: AIPriceLine[];
  symbol: string | null;
}

const _store = writable<AIOverlayState>({ lines: [], symbol: null });

export const chartAIOverlay = { subscribe: _store.subscribe };

export function setAIOverlay(symbol: string, lines: AIPriceLine[]): void {
  _store.set({ symbol, lines });
}

export function clearAIOverlay(): void {
  _store.set({ lines: [], symbol: null });
}

/**
 * chartSaveMode.store.ts
 *
 * Range-mode store for the drag-to-save toast flow (W-0402 PR11).
 *
 * Lifecycle:
 *   idle  →  enterRangeMode()  →  awaiting-drag
 *   awaiting-drag  →  setRange()   →  preview  (toast shown)
 *   preview  →  commitSave() | commitFindPattern() | commitDraft() | cancel()  →  idle
 *
 * This store is intentionally separate from the legacy chartSaveMode.ts
 * which drives the anchor-click + RangeSelectionPanel flow. This store
 * drives the new drag-to-save toast introduced in PR11.
 */

import { writable } from 'svelte/store';

export interface SaveRange {
  from: number;    // unix seconds
  to: number;      // unix seconds
  symbol: string;
  tf: string;
}

export type SaveModePhase = 'idle' | 'awaiting-drag' | 'preview';

export interface ChartSaveModeV2State {
  mode: SaveModePhase;
  range: SaveRange | null;
}

const DEFAULT: ChartSaveModeV2State = {
  mode: 'idle',
  range: null,
};

function createStore() {
  const { subscribe, update, set } = writable<ChartSaveModeV2State>({ ...DEFAULT });

  /** Enter awaiting-drag: cursor changes, chart listens for pointer drag. */
  function enterRangeMode(): void {
    update((s) => ({ ...s, mode: 'awaiting-drag', range: null }));
  }

  /**
   * Called on mouseup after a drag. Transitions to preview (shows toast).
   * If from === to the drag was a click — stay in awaiting-drag.
   */
  function setRange(range: SaveRange): void {
    if (range.from === range.to) return;
    update((s) => {
      if (s.mode !== 'awaiting-drag') return s;
      return { mode: 'preview', range };
    });
  }

  /**
   * User chose "Save" in the toast — persist via legacy chartSaveMode or
   * any external handler. Store returns to idle; caller handles persistence.
   */
  function commitSave(): SaveRange | null {
    let captured: SaveRange | null = null;
    update((s) => {
      captured = s.range;
      return { mode: 'idle', range: null };
    });
    return captured;
  }

  /**
   * User chose "Find Pattern" — returns range to caller for recall query.
   */
  function commitFindPattern(): SaveRange | null {
    let captured: SaveRange | null = null;
    update((s) => {
      captured = s.range;
      return { mode: 'idle', range: null };
    });
    return captured;
  }

  /**
   * User chose "Draft" — returns range; caller opens draft panel.
   */
  function commitDraft(): SaveRange | null {
    let captured: SaveRange | null = null;
    update((s) => {
      captured = s.range;
      return { mode: 'idle', range: null };
    });
    return captured;
  }

  /** Cancel / Esc — returns to idle without any action. */
  function cancel(): void {
    set({ ...DEFAULT });
  }

  return {
    subscribe,
    enterRangeMode,
    setRange,
    commitSave,
    commitFindPattern,
    commitDraft,
    cancel,
  };
}

export const chartSaveModeV2 = createStore();

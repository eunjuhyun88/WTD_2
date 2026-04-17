/**
 * chartSaveMode.ts
 *
 * Writable store for the Save Setup range-mode flow.
 * Store never touches LWC directly; CanvasHost subscribes and drives primitives.
 *
 * State shape per W-0086 Implementation Plan.
 */

import { writable } from 'svelte/store';
import { createPatternCapture } from '$lib/api/terminalPersistence';
import type { PatternCaptureCreateRequest } from '$lib/contracts/terminalPersistence';

export interface ChartSaveModeState {
  active: boolean;
  anchorA: number | null;     // unix seconds, first click
  anchorB: number | null;     // unix seconds, second click
  noteDraft: string;
  submitting: boolean;
  lastSavedCaptureId: string | null;
}

export type CaptureId = string;

const DEFAULT_STATE: ChartSaveModeState = {
  active: false,
  anchorA: null,
  anchorB: null,
  noteDraft: '',
  submitting: false,
  lastSavedCaptureId: null,
};

function createChartSaveModeStore() {
  const { subscribe, set, update } = writable<ChartSaveModeState>({ ...DEFAULT_STATE });

  function enterRangeMode(): void {
    update((s) => ({
      ...s,
      active: true,
      anchorA: null,
      anchorB: null,
      noteDraft: '',
      submitting: false,
    }));
  }

  function exitRangeMode(): void {
    update((s) => ({
      ...s,
      active: false,
      anchorA: null,
      anchorB: null,
      noteDraft: '',
      submitting: false,
    }));
  }

  /**
   * Sets the next available anchor.
   * First call sets anchorA; second call sets anchorB.
   */
  function setAnchor(t: number): void {
    update((s) => {
      if (!s.active) return s;
      if (s.anchorA === null) return { ...s, anchorA: t };
      if (s.anchorB === null) return { ...s, anchorB: t };
      // Both anchors already set; replace anchorB (drag-adjust behavior)
      return { ...s, anchorB: t };
    });
  }

  /**
   * Adjust a specific anchor after range is set (e.g. handle drag).
   */
  function adjustAnchor(which: 'A' | 'B', t: number): void {
    update((s) => {
      if (which === 'A') return { ...s, anchorA: t };
      return { ...s, anchorB: t };
    });
  }

  function setNote(text: string): void {
    update((s) => ({ ...s, noteDraft: text }));
  }

  /**
   * Persist the range capture via the terminal API.
   * Caller must supply symbol/tf/ohlcvBars context.
   */
  async function save(opts: {
    symbol: string;
    tf: string;
    ohlcvBars?: Array<{ time: number; open: number; high: number; low: number; close: number; volume?: number }>;
  }): Promise<CaptureId | null> {
    let state: ChartSaveModeState = DEFAULT_STATE;
    const unsub = subscribe((s) => { state = s; });
    unsub();

    if (!state.active || state.anchorA === null || state.anchorB === null) return null;

    const anchorStart = Math.min(state.anchorA, state.anchorB);
    const anchorEnd   = Math.max(state.anchorA, state.anchorB);

    // Slice klines to selected range
    const klines = (opts.ohlcvBars ?? []).filter(
      (b) => b.time >= anchorStart && b.time <= anchorEnd
    );

    update((s) => ({ ...s, submitting: true }));

    const payload: PatternCaptureCreateRequest = {
      symbol: opts.symbol,
      timeframe: opts.tf,
      contextKind: 'symbol',
      triggerOrigin: 'manual',
      reason: 'GENERAL',
      note: state.noteDraft,
      snapshot: {
        price: klines.length > 0 ? klines[klines.length - 1].close : null,
        change24h: null,
        funding: null,
        oiDelta: null,
        freshness: 'recent',
        viewport: {
          timeFrom: anchorStart,
          timeTo: anchorEnd,
          tf: opts.tf,
          barCount: klines.length,
          anchorTime: anchorStart,
          klines: klines.map((b) => ({
            time: b.time,
            open: b.open,
            high: b.high,
            low: b.low,
            close: b.close,
            volume: b.volume ?? 0,
          })),
          indicators: {},
        },
      },
      decision: {},
      sourceFreshness: { source: 'range_mode_save' },
    };

    try {
      const record = await createPatternCapture(payload);
      if (!record) {
        update((s) => ({ ...s, submitting: false }));
        return null;
      }
      update((s) => ({
        ...s,
        submitting: false,
        active: false,
        anchorA: null,
        anchorB: null,
        noteDraft: '',
        lastSavedCaptureId: record.id,
      }));
      return record.id;
    } catch {
      update((s) => ({ ...s, submitting: false }));
      return null;
    }
  }

  return {
    subscribe,
    enterRangeMode,
    exitRangeMode,
    setAnchor,
    adjustAnchor,
    setNote,
    save,
    /** Read current state once (non-reactive). */
    snapshot(): ChartSaveModeState {
      let s = DEFAULT_STATE;
      const unsub = subscribe((v) => { s = v; });
      unsub();
      return s;
    },
  };
}

export const chartSaveMode = createChartSaveModeStore();

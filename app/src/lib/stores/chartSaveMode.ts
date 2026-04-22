/**
 * chartSaveMode.ts
 *
 * Writable store for the Save Setup range-mode flow.
 * Store never touches LWC directly; ChartBoard subscribes and drives primitives.
 *
 * State shape per W-0086 / W-0117 Implementation Plan.
 */

import { writable } from 'svelte/store';
import { createPatternCapture } from '$lib/api/terminalPersistence';
import type { ChartSeriesPayload } from '$lib/api/terminalBackend';
import type { CaptureSelectionPhase, RangeSelectionBar } from '$lib/terminal/rangeSelectionCapture';
import { buildPatternCaptureRequestFromSelection } from '$lib/terminal/rangeSelectionCapture';

export interface ChartSaveModeState {
  active: boolean;
  anchorA: number | null;     // unix seconds, drag start
  anchorB: number | null;     // unix seconds, drag end (live during drag)
  noteDraft: string;
  submitting: boolean;
  lastSavedCaptureId: string | null;
  /** Full chart payload set by ChartBoard when data loads; used for indicator slicing. */
  payload: ChartSeriesPayload | null;
}

export type CaptureId = string;

const DEFAULT_STATE: ChartSaveModeState = {
  active: false,
  anchorA: null,
  anchorB: null,
  noteDraft: '',
  submitting: false,
  lastSavedCaptureId: null,
  payload: null,
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
   * Start a drag: set anchorA, clear anchorB.
   * Called on mousedown when range mode is active.
   */
  function startDrag(t: number): void {
    update((s) => {
      if (!s.active) return s;
      return { ...s, anchorA: t, anchorB: null };
    });
  }

  /**
   * Sets the next available anchor (legacy two-click path, kept for mobile).
   * First call sets anchorA; second call sets anchorB.
   */
  function setAnchor(t: number): void {
    update((s) => {
      if (!s.active) return s;
      if (s.anchorA === null) return { ...s, anchorA: t };
      if (s.anchorB === null) return { ...s, anchorB: t };
      return { ...s, anchorB: t };
    });
  }

  /**
   * Adjust a specific anchor — used for live drag updates (mousemove/mouseup).
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
   * Store the current chart payload so save() can slice indicators.
   * Called by ChartBoard whenever chartData changes.
   */
  function setPayload(p: ChartSeriesPayload | null): void {
    update((s) => ({ ...s, payload: p }));
  }

  /**
   * Persist the range capture via the terminal API.
   * Caller must supply symbol/tf/ohlcvBars context.
   */
  async function save(opts: {
    symbol: string;
    tf: string;
    phase?: CaptureSelectionPhase;
    note?: string;
    ohlcvBars?: RangeSelectionBar[];
  }): Promise<CaptureId | null> {
    let state: ChartSaveModeState = DEFAULT_STATE;
    const unsub = subscribe((s) => { state = s; });
    unsub();

    if (!state.active || state.anchorA === null || state.anchorB === null) return null;

    update((s) => ({ ...s, submitting: true }));

    try {
      const capturePayload = buildPatternCaptureRequestFromSelection({
        symbol: opts.symbol,
        timeframe: opts.tf,
        payload: state.payload,
        anchorA: state.anchorA,
        anchorB: state.anchorB,
        ohlcvBars: opts.ohlcvBars,
        note: opts.note ?? state.noteDraft,
        phase: opts.phase ?? 'GENERAL',
        sourceFreshness: { source: 'range_mode_save' },
      });

      if (!capturePayload) {
        update((s) => ({ ...s, submitting: false }));
        return null;
      }

      const record = await createPatternCapture(capturePayload);
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
    startDrag,
    setAnchor,
    adjustAnchor,
    setNote,
    setPayload,
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

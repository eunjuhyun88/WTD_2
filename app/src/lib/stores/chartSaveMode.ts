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
import type { PatternCaptureCreateRequest } from '$lib/contracts/terminalPersistence';
import type { ChartSeriesPayload } from '$lib/api/terminalBackend';
import { slicePayloadToViewport } from '$lib/terminal/chartViewportCapture';

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

    // Slice indicators from stored payload (W-0117 Slice B)
    let viewport = state.payload
      ? slicePayloadToViewport(state.payload, anchorStart, anchorEnd, anchorStart)
      : null;

    update((s) => ({ ...s, submitting: true }));

    const capturePayload: PatternCaptureCreateRequest = {
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
        viewport: viewport ?? {
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

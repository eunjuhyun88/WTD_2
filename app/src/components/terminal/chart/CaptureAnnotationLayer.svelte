<script lang="ts">
  /**
   * CaptureAnnotationLayer.svelte
   *
   * Attaches CaptureMarkerPrimitive + EvalWindowPrimitive to the given LWC
   * candlestick series for every annotation fetched from the engine.
   *
   * Props:
   *   series     — LWC ISeriesApi (candlestick series to attach to)
   *   symbol     — e.g. "BTCUSDT"
   *   timeframe  — e.g. "1h"
   *
   * The component manages its own polling store and auto-syncs primitives
   * whenever annotations change.
   */
  import { onDestroy } from 'svelte';
  import { get } from 'svelte/store';
  import type { ISeriesApi, Time } from 'lightweight-charts';
  import {
    createCaptureAnnotationsStore,
    type CaptureAnnotationsStore,
  } from '$lib/stores/captureAnnotationsStore';
  import { CaptureMarkerPrimitive } from './primitives/CaptureMarkerPrimitive';
  import { EvalWindowPrimitive }    from './primitives/EvalWindowPrimitive';
  import type { CaptureAnnotation } from './primitives/CaptureMarkerPrimitive';

  export let series: ISeriesApi<'Candlestick', Time> | null = null;
  export let symbol: string = '';
  export let timeframe: string = '1h';
  /** Called whenever the annotation list changes — lets parent maintain a cache for click handlers. */
  export let onAnnotationsChange: ((anns: CaptureAnnotation[]) => void) | null = null;

  // ── Primitive registry ──────────────────────────────────────────────────────
  // Map capture_id → { marker, window } primitives currently attached
  const _attached = new Map<string, {
    marker: CaptureMarkerPrimitive;
    window: EvalWindowPrimitive;
  }>();

  let _store: CaptureAnnotationsStore | null = null;
  let _unsubscribe: (() => void) | null = null;

  // ── Boot / tear-down on prop change ────────────────────────────────────────
  $: if (symbol && timeframe) {
    _teardown();
    _store = createCaptureAnnotationsStore(symbol, timeframe);
    _unsubscribe = _store.subscribe(state => {
      if (series) _syncPrimitives(state.annotations);
    });
  }

  $: if (series) {
    // Series changed — re-attach all existing primitives
    _detachAll();
    if (_store) {
      _syncPrimitives(get(_store).annotations);
    }
  }

  // ── Sync helpers ─────────────────────────────────────────────────────────────

  function _syncPrimitives(annotations: CaptureAnnotation[]): void {
    if (!series) return;

    const incomingIds = new Set(annotations.map(a => a.capture_id));

    // Remove stale primitives
    for (const [id, prims] of _attached) {
      if (!incomingIds.has(id)) {
        series.detachPrimitive(prims.marker);
        series.detachPrimitive(prims.window);
        _attached.delete(id);
      }
    }

    // Add new or update existing
    for (const ann of annotations) {
      const existing = _attached.get(ann.capture_id);
      if (existing) {
        existing.marker.update(ann);
        existing.window.update(ann);
      } else {
        const marker = new CaptureMarkerPrimitive(ann);
        const window = new EvalWindowPrimitive(ann);
        series.attachPrimitive(window);  // bottom z-order first
        series.attachPrimitive(marker);  // top z-order on top
        _attached.set(ann.capture_id, { marker, window });
      }
    }

    // Notify parent so it can maintain a cache for click-to-open logic
    onAnnotationsChange?.(annotations);
  }

  function _detachAll(): void {
    if (!series) return;
    for (const prims of _attached.values()) {
      series.detachPrimitive(prims.marker);
      series.detachPrimitive(prims.window);
    }
    _attached.clear();
  }

  function _teardown(): void {
    _detachAll();
    _unsubscribe?.();
    _store?.destroy();
    _store = null;
    _unsubscribe = null;
  }

  onDestroy(_teardown);
</script>

<!-- Headless component — no DOM output -->

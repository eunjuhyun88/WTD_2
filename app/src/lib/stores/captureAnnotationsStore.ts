/**
 * captureAnnotationsStore.ts
 *
 * Polls GET /api/engine/captures/chart-annotations for a given symbol+timeframe
 * and maintains the annotation list. Used by CaptureAnnotationLayer to drive
 * LWC primitives.
 *
 * Usage:
 *   const store = createCaptureAnnotationsStore('BTCUSDT', '1h');
 *   $store.annotations  // CaptureAnnotation[]
 *   store.destroy()     // stop polling
 */

import { writable, type Readable } from 'svelte/store';
import type { CaptureAnnotation } from '$components/terminal/chart/primitives/CaptureMarkerPrimitive';

export interface CaptureAnnotationsState {
  annotations: CaptureAnnotation[];
  loading: boolean;
  error: string | null;
  lastFetchedAt: number | null;
}

const POLL_INTERVAL_MS = 60_000;  // 60s — matches Cloud Scheduler cadence

export interface CaptureAnnotationsStore extends Readable<CaptureAnnotationsState> {
  refresh(): Promise<void>;
  destroy(): void;
}

export function createCaptureAnnotationsStore(
  symbol: string,
  timeframe: string,
): CaptureAnnotationsStore {
  const { subscribe, update } = writable<CaptureAnnotationsState>({
    annotations: [],
    loading: false,
    error: null,
    lastFetchedAt: null,
  });

  let _timer: ReturnType<typeof setInterval> | null = null;
  let _destroyed = false;

  async function refresh(): Promise<void> {
    if (_destroyed) return;
    update(s => ({ ...s, loading: true, error: null }));
    try {
      const url = `/api/engine/captures/chart-annotations?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}&limit=50`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!_destroyed) {
        update(s => ({
          ...s,
          annotations: data.annotations ?? [],
          loading: false,
          lastFetchedAt: Date.now(),
        }));
      }
    } catch (err) {
      if (!_destroyed) {
        update(s => ({
          ...s,
          loading: false,
          error: err instanceof Error ? err.message : String(err),
        }));
      }
    }
  }

  // Initial fetch + polling
  refresh();
  _timer = setInterval(refresh, POLL_INTERVAL_MS);

  function destroy(): void {
    _destroyed = true;
    if (_timer) { clearInterval(_timer); _timer = null; }
  }

  return { subscribe, refresh, destroy };
}

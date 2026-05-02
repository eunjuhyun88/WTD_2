/**
 * crosshairBus — global crosshair X-axis sync between chart panes.
 *
 * Producers call `publishCrosshair(time, originId)` from a
 * `subscribeCrosshairMove` handler; the value is rAF-throttled to 1 update
 * per frame to avoid feedback loops between panes that read+write each
 * other on every move.
 *
 * Consumers subscribe to `crosshairBus` and apply the time to their chart's
 * time scale, ignoring updates whose `origin` matches their own pane id.
 */
import { writable } from 'svelte/store';

export interface CrosshairState {
  time: number | null;
  origin: string | null;
}

const _store = writable<CrosshairState>({ time: null, origin: null });

export const crosshairBus = { subscribe: _store.subscribe };

let pendingFrame: number | null = null;
let pending: CrosshairState | null = null;

export function publishCrosshair(time: number | null, origin: string): void {
  pending = { time, origin };
  if (pendingFrame !== null) return;
  if (typeof requestAnimationFrame === 'undefined') {
    if (pending) _store.set(pending);
    pending = null;
    return;
  }
  pendingFrame = requestAnimationFrame(() => {
    pendingFrame = null;
    if (pending) _store.set(pending);
    pending = null;
  });
}

export function clearCrosshair(): void {
  if (pendingFrame !== null && typeof cancelAnimationFrame !== 'undefined') {
    cancelAnimationFrame(pendingFrame);
    pendingFrame = null;
  }
  pending = null;
  _store.set({ time: null, origin: null });
}

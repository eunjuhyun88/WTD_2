/**
 * chartFreshness — D-10 lightweight store of the last chart-data tick.
 *
 * Pushed to by chart adapters whenever the visible price stream advances;
 * read by StatusBar to render a "FRESH 12s" age counter.
 */
import { writable } from 'svelte/store';

const _store = writable<number | null>(null);

export const chartFreshness = { subscribe: _store.subscribe };

export function setChartFreshness(epochMs: number): void {
  _store.set(epochMs);
}

export function clearChartFreshness(): void {
  _store.set(null);
}

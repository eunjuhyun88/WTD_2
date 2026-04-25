/**
 * comparisonStore.ts  (W-0210 Layer 3)
 *
 * Fetches and normalizes a comparison symbol's OHLCV against the main chart.
 * Both series are normalized to 100 at the first shared candle — shows
 * correlation / divergence instantly (leading vs. lagging).
 *
 * Usage:
 *   comparisonStore.setSymbol('BTCUSDT', '4h');
 *   // subscribe to $comparisonStore.data — array of {time, value} normalized points
 */

import { writable, get } from 'svelte/store';
import type { UTCTimestamp } from 'lightweight-charts';

export interface NormalizedPoint {
  time: UTCTimestamp;
  value: number;  // 100-based index (100 = starting price)
}

export interface ComparisonState {
  symbol: string;          // e.g. 'BTCUSDT'
  tf: string;
  data: NormalizedPoint[];
  loading: boolean;
  error: string | null;
  lastFetch: number;       // epoch ms
}

const INITIAL: ComparisonState = {
  symbol: 'BTCUSDT',
  tf: '4h',
  data: [],
  loading: false,
  error: null,
  lastFetch: 0,
};

const CACHE_TTL_MS = 60_000; // 60s — refresh when TF changes or TTL expires

function createComparisonStore() {
  const { subscribe, set, update } = writable<ComparisonState>(INITIAL);

  async function fetchData(symbol: string, tf: string) {
    const state = get({ subscribe });
    const now = Date.now();

    // Cache hit — skip if same symbol/tf fetched recently
    if (
      state.symbol === symbol &&
      state.tf === tf &&
      state.data.length > 0 &&
      now - state.lastFetch < CACHE_TTL_MS
    ) return;

    update(s => ({ ...s, loading: true, error: null }));

    try {
      const res = await fetch(
        `/api/chart/klines?symbol=${encodeURIComponent(symbol)}&tf=${encodeURIComponent(tf)}&limit=500`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload = await res.json() as { klines: Array<{ time: number; close: number }> };
      const klines = payload.klines ?? [];
      if (!klines.length) {
        update(s => ({ ...s, loading: false, data: [], symbol, tf, lastFetch: now }));
        return;
      }

      // Normalize to 100 at first bar
      const base = klines[0].close;
      const normalized: NormalizedPoint[] = klines.map(k => ({
        time: k.time as UTCTimestamp,
        value: base > 0 ? (k.close / base) * 100 : 100,
      }));

      set({ symbol, tf, data: normalized, loading: false, error: null, lastFetch: now });
    } catch (e) {
      update(s => ({ ...s, loading: false, error: String(e) }));
    }
  }

  function setSymbol(symbol: string, tf: string) {
    void fetchData(symbol, tf);
  }

  function clear() {
    set(INITIAL);
  }

  return { subscribe, setSymbol, clear };
}

export const comparisonStore = createComparisonStore();

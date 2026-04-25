/**
 * whaleStore.ts  (W-0210 Layer 2)
 *
 * Client-side store for whale position data from the /api/cogochi/whales proxy.
 * Updates on demand (symbol change, 60s interval when visible).
 *
 * The Hyperliquid public leaderboard API gives us top traders by account value.
 * Liquidation prices are estimated from leverage × entry when available.
 */

import { writable, get } from 'svelte/store';
import type { WhalePosition } from '$lib/types/whale';

export type { WhalePosition };

export interface WhaleState {
  symbol: string;
  positions: WhalePosition[];
  loading: boolean;
  error: string | null;
  lastFetch: number;
}

const INITIAL: WhaleState = {
  symbol: '',
  positions: [],
  loading: false,
  error: null,
  lastFetch: 0,
};

const CACHE_TTL_MS = 60_000;

function createWhaleStore() {
  const { subscribe, set, update } = writable<WhaleState>(INITIAL);

  async function fetch(symbol: string) {
    const state = get({ subscribe });
    const now = Date.now();

    // Fresh cache for same symbol
    if (state.symbol === symbol && state.positions.length > 0 && now - state.lastFetch < CACHE_TTL_MS) {
      return;
    }

    update(s => ({ ...s, loading: true, error: null, symbol }));

    try {
      const base = symbol.replace('USDT', '');
      const res = await globalThis.fetch(`/api/cogochi/whales?symbol=${encodeURIComponent(base)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { positions?: WhalePosition[]; error?: string };
      if (data.error) throw new Error(data.error);

      update(s => ({
        ...s,
        loading: false,
        positions: data.positions ?? [],
        lastFetch: now,
        error: null,
      }));
    } catch (e) {
      update(s => ({ ...s, loading: false, error: String(e) }));
    }
  }

  function clear() {
    set(INITIAL);
  }

  return { subscribe, fetch, clear };
}

export const whaleStore = createWhaleStore();

/**
 * newsStore.ts  (W-0210 Layer 4)
 *
 * Fetches news events for a symbol and provides:
 * 1. Latest headlines for AlphaMarketBar
 * 2. Timestamped events for chart markers (merged into alphaMarkers)
 *
 * Cache: 5 minutes (matches server-side cache TTL).
 */

import { writable, get } from 'svelte/store';
export interface NewsEvent {
  id: string;
  title: string;
  publishedAt: number;
  url: string;
  symbols: string[];
  sentiment: 'positive' | 'negative' | 'neutral';
  source: string;
}


export interface NewsState {
  symbol: string;
  events: NewsEvent[];
  loading: boolean;
  error: string | null;
  lastFetch: number;
}

const INITIAL: NewsState = {
  symbol: '',
  events: [],
  loading: false,
  error: null,
  lastFetch: 0,
};

const CACHE_TTL_MS = 300_000; // 5 min

function createNewsStore() {
  const { subscribe, set, update } = writable<NewsState>(INITIAL);

  async function fetchNews(symbol: string) {
    const state = get({ subscribe });
    const now = Date.now();

    if (state.symbol === symbol && state.events.length > 0 && now - state.lastFetch < CACHE_TTL_MS) {
      return;
    }

    update(s => ({ ...s, loading: true, error: null, symbol }));

    try {
      const base = symbol.replace('USDT', '');
      const res = await globalThis.fetch(`/api/cogochi/news?symbol=${encodeURIComponent(base)}&limit=20`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { events?: NewsEvent[]; error?: string };
      if (data.error) throw new Error(data.error);

      update(s => ({
        ...s,
        loading: false,
        events: data.events ?? [],
        lastFetch: now,
        error: null,
      }));
    } catch (e) {
      update(s => ({ ...s, loading: false, error: String(e) }));
    }
  }

  function clear() { set(INITIAL); }

  return { subscribe, fetchNews, clear };
}

export const newsStore = createNewsStore();

/**
 * Convert news events to alphaMarkers shape for chart rendering.
 * Only returns events within the last 24h (prevents cluttered old markers).
 */
export function newsEventsToAlphaMarkers(
  events: NewsEvent[],
  maxAge = 86400, // seconds
): Array<{ timestamp: number; phase: string; label: string; color?: string; shape?: string }> {
  const cutoff = Math.floor(Date.now() / 1000) - maxAge;
  return events
    .filter(e => e.publishedAt > cutoff)
    .slice(0, 8)  // max 8 news markers on chart
    .map(e => ({
      timestamp: e.publishedAt,
      phase: 'news',
      label: e.title.length > 28 ? e.title.slice(0, 28) + '…' : e.title,
      color: e.sentiment === 'positive' ? 'rgba(34,171,148,0.8)'
           : e.sentiment === 'negative' ? 'rgba(242,54,69,0.8)'
           : 'rgba(255,199,80,0.6)',
      shape: 'square',
    }));
}

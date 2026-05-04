import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export interface ExchangeKey {
  exchange: 'binance';
  apiKeyLast4: string;
  savedAt: string;
}

const STORAGE_KEY = 'wtd_exchange_keys_mock';

function loadFromStorage(): ExchangeKey | null {
  if (!browser) return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) as ExchangeKey : null;
  } catch { return null; }
}

function createExchangeKeysStore() {
  const { subscribe, set } = writable<ExchangeKey | null>(loadFromStorage());
  return {
    subscribe,
    saveMock(apiKey: string, _secret: string) {
      const entry: ExchangeKey = {
        exchange: 'binance',
        apiKeyLast4: apiKey.slice(-4),
        savedAt: new Date().toISOString(),
      };
      if (browser) localStorage.setItem(STORAGE_KEY, JSON.stringify(entry));
      set(entry);
    },
    remove() {
      if (browser) localStorage.removeItem(STORAGE_KEY);
      set(null);
    },
  };
}

export const exchangeKeys = createExchangeKeysStore();

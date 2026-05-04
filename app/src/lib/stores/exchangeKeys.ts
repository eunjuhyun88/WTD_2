import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export interface ExchangeKey {
  exchange: 'binance';
  apiKeyLast4: string;
  savedAt: string;
}

// Cache key for optimistic UI (not the real key — just metadata)
const CACHE_KEY = 'wtd_exchange_status_cache';

function loadCache(): ExchangeKey | null {
  if (!browser) return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) as ExchangeKey : null;
  } catch { return null; }
}

function createExchangeKeysStore() {
  const { subscribe, set } = writable<ExchangeKey | null>(loadCache());

  return {
    subscribe,

    async fetchStatus() {
      if (!browser) return;
      try {
        const res = await fetch('/api/exchange/binance');
        if (res.ok) {
          const data = await res.json() as { connected: boolean; apiKeyLast4?: string; savedAt?: string };
          if (data.connected && data.apiKeyLast4 && data.savedAt) {
            const entry: ExchangeKey = { exchange: 'binance', apiKeyLast4: data.apiKeyLast4, savedAt: data.savedAt };
            localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
            set(entry);
          } else {
            localStorage.removeItem(CACHE_KEY);
            set(null);
          }
        }
      } catch { /* keep cached state */ }
    },

    async save(apiKey: string, secret: string): Promise<{ ok: boolean; error?: string; code?: string; ipRestrict?: boolean }> {
      try {
        const res = await fetch('/api/exchange/binance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apiKey, secret }),
        });
        const data = await res.json() as { ok?: boolean; error?: string; code?: string; apiKeyLast4?: string; savedAt?: string; ipRestrict?: boolean };
        if (res.ok && data.ok && data.apiKeyLast4 && data.savedAt) {
          const entry: ExchangeKey = { exchange: 'binance', apiKeyLast4: data.apiKeyLast4, savedAt: data.savedAt };
          if (browser) localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
          set(entry);
          return { ok: true, ipRestrict: data.ipRestrict };
        }
        return { ok: false, error: data.error ?? '저장 실패', code: data.code };
      } catch (err: unknown) {
        return { ok: false, error: err instanceof Error ? err.message : '네트워크 오류' };
      }
    },

    async remove(): Promise<{ ok: boolean; error?: string }> {
      try {
        const res = await fetch('/api/exchange/binance', { method: 'DELETE' });
        if (browser) localStorage.removeItem(CACHE_KEY);
        set(null);
        return { ok: res.ok };
      } catch (err: unknown) {
        return { ok: false, error: err instanceof Error ? err.message : '네트워크 오류' };
      }
    },

    /** Backward compat for PR1 mock calls — now delegates to save() */
    saveMock(apiKey: string, secret: string) {
      void this.save(apiKey, secret);
    },
  };
}

export const exchangeKeys = createExchangeKeysStore();

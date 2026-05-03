import { browser } from '$app/environment';

const FAVORITES_KEY = 'wtd.chart.indicators.favorites.v1';
const RECENTS_KEY = 'wtd.chart.indicators.recents.v1';
const MAX_RECENTS = 8;

function loadSet(key: string): Set<string> {
  if (!browser) return new Set();
  try {
    const raw = localStorage.getItem(key);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveSet(key: string, set: Set<string>): void {
  if (!browser) return;
  try {
    localStorage.setItem(key, JSON.stringify([...set]));
  } catch {
    // quota exceeded — silently ignore
  }
}

function loadList(key: string): string[] {
  if (!browser) return [];
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveList(key: string, list: string[]): void {
  if (!browser) return;
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {}
}

export const catalogFavorites = {
  isFavorite(defId: string): boolean {
    return loadSet(FAVORITES_KEY).has(defId);
  },

  toggle(defId: string): boolean {
    const set = loadSet(FAVORITES_KEY);
    if (set.has(defId)) {
      set.delete(defId);
    } else {
      set.add(defId);
    }
    saveSet(FAVORITES_KEY, set);
    return set.has(defId);
  },

  getAll(): string[] {
    return [...loadSet(FAVORITES_KEY)];
  },

  recordRecent(defId: string): void {
    const list = loadList(RECENTS_KEY).filter(id => id !== defId);
    list.unshift(defId);
    saveList(RECENTS_KEY, list.slice(0, MAX_RECENTS));
  },

  getRecents(): string[] {
    return loadList(RECENTS_KEY);
  },
};

// indicatorFavorites — per-user favorites + recents for indicator catalog (W-0399)

import { browser } from '$app/environment';

const FAVS_KEY    = 'wtd.chart.indicators.favorites.v1';
const RECENTS_KEY = 'wtd.chart.indicators.recents.v1';
const MAX_FAVS    = 25;
const MAX_RECENTS = 10;

function loadList(key: string): string[] {
  if (!browser) return [];
  try { return JSON.parse(localStorage.getItem(key) ?? '[]') as string[]; }
  catch { return []; }
}

function saveList(key: string, list: string[]): void {
  if (!browser) return;
  try { localStorage.setItem(key, JSON.stringify(list)); } catch { /* quota */ }
}

// ── Favorites ──────────────────────────────────────────────────────────────

let _favs = $state<string[]>(loadList(FAVS_KEY));

export const indicatorFavorites = {
  get list(): string[]          { return _favs; },
  has(id: string): boolean      { return _favs.includes(id); },
  toggle(id: string): void {
    const i = _favs.indexOf(id);
    if (i >= 0) {
      _favs.splice(i, 1);
    } else {
      _favs.unshift(id);
      if (_favs.length > MAX_FAVS) _favs.length = MAX_FAVS;
    }
    saveList(FAVS_KEY, _favs);
  },
};

// ── Recents ────────────────────────────────────────────────────────────────

let _recents = $state<string[]>(loadList(RECENTS_KEY));

export const indicatorRecents = {
  get list(): string[]     { return _recents; },
  push(id: string): void {
    const i = _recents.indexOf(id);
    if (i >= 0) _recents.splice(i, 1);
    _recents.unshift(id);
    if (_recents.length > MAX_RECENTS) _recents.length = MAX_RECENTS;
    saveList(RECENTS_KEY, _recents);
  },
};

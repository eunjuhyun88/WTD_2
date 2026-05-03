import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock browser env and localStorage before importing the module
vi.mock('$app/environment', () => ({ browser: true }));

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { store = {}; },
  };
})();

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true });

import { catalogFavorites } from './catalogFavorites';

describe('catalogFavorites (W-0400 Phase 1C)', () => {
  beforeEach(() => localStorageMock.clear());

  it('AC1C-1: isFavorite returns false for unknown def', () => {
    expect(catalogFavorites.isFavorite('rsi')).toBe(false);
  });

  it('AC1C-1: toggle adds and removes from favorites', () => {
    expect(catalogFavorites.toggle('rsi')).toBe(true);
    expect(catalogFavorites.isFavorite('rsi')).toBe(true);
    expect(catalogFavorites.toggle('rsi')).toBe(false);
    expect(catalogFavorites.isFavorite('rsi')).toBe(false);
  });

  it('AC1C-1: getAll returns all favorited IDs', () => {
    catalogFavorites.toggle('rsi');
    catalogFavorites.toggle('macd');
    const all = catalogFavorites.getAll();
    expect(all).toContain('rsi');
    expect(all).toContain('macd');
  });

  it('AC1C-3: recordRecent pushes to front and dedupes', () => {
    catalogFavorites.recordRecent('rsi');
    catalogFavorites.recordRecent('macd');
    catalogFavorites.recordRecent('rsi'); // re-add rsi — should move to front
    const recents = catalogFavorites.getRecents();
    expect(recents[0]).toBe('rsi');
    expect(recents[1]).toBe('macd');
    expect(recents.length).toBe(2);
  });

  it('AC1C-3: recents capped at 8', () => {
    for (let i = 0; i < 10; i++) catalogFavorites.recordRecent(`ind_${i}`);
    expect(catalogFavorites.getRecents().length).toBe(8);
  });

  it('AC1C-3: getRecents returns empty array when none recorded', () => {
    expect(catalogFavorites.getRecents()).toEqual([]);
  });
});

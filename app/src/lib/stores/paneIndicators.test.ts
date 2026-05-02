import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getIndicatorStore,
  activePaneId,
  applyChartAction,
  setActivePane,
} from './paneIndicators';
import { get } from 'svelte/store';

const mockLocalStorage = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();

global.localStorage = mockLocalStorage as unknown as Storage;

let counter = 0;

describe('paneIndicators', () => {
  beforeEach(() => { mockLocalStorage.clear(); activePaneId.set(0); counter++; });
  afterEach(() => { mockLocalStorage.clear(); });

  function id(offset = 0) { return counter * 100 + offset; }

  describe('getIndicatorStore', () => {
    it('creates a store with default state', () => {
      const store = getIndicatorStore(id());
      const state = get(store);
      expect(state.vwap).toBe(false);
      expect(state.rsi).toBe(false);
    });

    it('returns same instance for same paneId', () => {
      expect(getIndicatorStore(id())).toBe(getIndicatorStore(id()));
    });

    it('returns different stores for different paneIds', () => {
      expect(getIndicatorStore(id(0))).not.toBe(getIndicatorStore(id(1)));
    });
  });

  describe('localStorage persistence', () => {
    it('persists state changes', () => {
      const i = id();
      getIndicatorStore(i).update((s) => ({ ...s, vwap: true }));
      const stored = mockLocalStorage.getItem(`chart_indicators::pane_${i}`);
      expect(JSON.parse(stored!).vwap).toBe(true);
    });

    it('restores from localStorage', () => {
      const i = id();
      getIndicatorStore(i).update((s) => ({ ...s, rsi: true }));
      expect(get(getIndicatorStore(i)).rsi).toBe(true);
    });

    it('uses per-pane storage keys', () => {
      const i0 = id(0), i1 = id(1);
      getIndicatorStore(i0).update((s) => ({ ...s, vwap: true }));
      getIndicatorStore(i1).update((s) => ({ ...s, sma20: true }));
      expect(JSON.parse(mockLocalStorage.getItem(`chart_indicators::pane_${i0}`)!).vwap).toBe(true);
      expect(JSON.parse(mockLocalStorage.getItem(`chart_indicators::pane_${i1}`)!).sma20).toBe(true);
    });
  });

  describe('applyChartAction', () => {
    it('adds indicator to active pane only', () => {
      const i0 = id(0), i1 = id(1);
      const s0 = getIndicatorStore(i0), s1 = getIndicatorStore(i1);
      activePaneId.set(i0);
      applyChartAction('add_indicator', 'vwap');
      expect(get(s0).vwap).toBe(true);
      expect(get(s1).vwap).toBe(false);
    });

    it('removes indicator from active pane only', () => {
      const i0 = id(0), i1 = id(1);
      const s0 = getIndicatorStore(i0), s1 = getIndicatorStore(i1);
      s0.update((s) => ({ ...s, vwap: true }));
      s1.update((s) => ({ ...s, vwap: true }));
      activePaneId.set(i0);
      applyChartAction('remove_indicator', 'vwap');
      expect(get(s0).vwap).toBe(false);
      expect(get(s1).vwap).toBe(true);
    });
  });

  describe('setActivePane', () => {
    it('updates activePaneId', () => {
      setActivePane(7);
      expect(get(activePaneId)).toBe(7);
    });
  });

  describe('per-pane isolation', () => {
    it('SSE dispatches do not bleed across panes', () => {
      const i0 = id(0), i1 = id(1);
      const s0 = getIndicatorStore(i0), s1 = getIndicatorStore(i1);
      activePaneId.set(i0);
      applyChartAction('add_indicator', 'vwap');
      activePaneId.set(i1);
      applyChartAction('add_indicator', 'rsi');
      expect(get(s0)).toEqual(expect.objectContaining({ vwap: true, rsi: false }));
      expect(get(s1)).toEqual(expect.objectContaining({ vwap: false, rsi: true }));
    });
  });
});

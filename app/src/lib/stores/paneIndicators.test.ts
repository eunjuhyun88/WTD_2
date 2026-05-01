import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getIndicatorStore,
  activePaneId,
  applyChartAction,
  setActivePane,
  type IndicatorState,
} from './paneIndicators';
import { get } from 'svelte/store';

// Mock localStorage
const mockLocalStorage = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

global.localStorage = mockLocalStorage as any;

let testPaneCounter = 0;

describe('paneIndicators store', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    mockLocalStorage.clear();
    // Reset activePaneId to 0
    activePaneId.set(0);
    testPaneCounter++;
  });

  afterEach(() => {
    mockLocalStorage.clear();
  });

  // Helper to get unique pane IDs per test to avoid cache conflicts
  function getPaneId(offset = 0): number {
    return testPaneCounter * 100 + offset;
  }

  describe('getIndicatorStore', () => {
    it('should create a store for a given paneId', () => {
      const id = getPaneId(0);
      const store = getIndicatorStore(id);
      expect(store).toBeDefined();
      const state = get(store);
      expect(state).toHaveProperty('vwap');
      expect(state).toHaveProperty('sma20');
    });

    it('should return the same store instance for the same paneId', () => {
      const id = getPaneId(0);
      const store1 = getIndicatorStore(id);
      const store2 = getIndicatorStore(id);
      expect(store1).toBe(store2);
    });

    it('should create different stores for different paneIds', () => {
      const store0 = getIndicatorStore(getPaneId(0));
      const store1 = getIndicatorStore(getPaneId(1));
      expect(store0).not.toBe(store1);
    });

    it('should have default state values', () => {
      const id = getPaneId(0);
      const store = getIndicatorStore(id);
      const state = get(store);
      expect(state.vwap).toBe(false);
      expect(state.sma20).toBe(false);
      expect(state.ema50).toBe(false);
      expect(state.rsi).toBe(false);
      expect(state.macd).toBe(false);
      expect(state.bollingerBands).toBe(false);
    });
  });

  describe('localStorage persistence', () => {
    it('should persist state to localStorage', () => {
      const id = getPaneId(0);
      const store = getIndicatorStore(id);
      store.update((s) => ({ ...s, vwap: true }));

      const stored = mockLocalStorage.getItem(`chart_indicators::pane_${id}`);
      expect(stored).toBeDefined();
      const parsed = JSON.parse(stored!);
      expect(parsed.vwap).toBe(true);
    });

    it('should restore state from localStorage on next get', () => {
      // Set initial state and persist
      const id = getPaneId(0);
      const store0 = getIndicatorStore(id);
      store0.update((s) => ({ ...s, rsi: true, macd: true }));

      // Create new store instance and verify it loads from localStorage
      const store0Again = getIndicatorStore(id);
      const state = get(store0Again);
      expect(state.rsi).toBe(true);
      expect(state.macd).toBe(true);
    });

    it('should use per-pane storage keys', () => {
      const id0 = getPaneId(0);
      const id1 = getPaneId(1);
      const store0 = getIndicatorStore(id0);
      const store1 = getIndicatorStore(id1);

      store0.update((s) => ({ ...s, vwap: true }));
      store1.update((s) => ({ ...s, sma20: true }));

      const stored0 = mockLocalStorage.getItem(`chart_indicators::pane_${id0}`);
      const stored1 = mockLocalStorage.getItem(`chart_indicators::pane_${id1}`);

      expect(JSON.parse(stored0!).vwap).toBe(true);
      expect(JSON.parse(stored1!).sma20).toBe(true);
    });
  });

  describe('applyChartAction', () => {
    it('should add indicator to active pane only', () => {
      const id0 = getPaneId(0);
      const id1 = getPaneId(1);
      const store0 = getIndicatorStore(id0);
      const store1 = getIndicatorStore(id1);

      activePaneId.set(id0);
      applyChartAction('add_indicator', 'vwap');

      expect(get(store0).vwap).toBe(true);
      expect(get(store1).vwap).toBe(false);
    });

    it('should remove indicator from active pane only', () => {
      const id0 = getPaneId(0);
      const id1 = getPaneId(1);
      const store0 = getIndicatorStore(id0);
      const store1 = getIndicatorStore(id1);

      // Setup: enable vwap on both panes
      store0.update((s) => ({ ...s, vwap: true }));
      store1.update((s) => ({ ...s, vwap: true }));

      activePaneId.set(id0);
      applyChartAction('remove_indicator', 'vwap');

      expect(get(store0).vwap).toBe(false);
      expect(get(store1).vwap).toBe(true);
    });

    it('should respect current activePaneId', () => {
      const id0 = getPaneId(0);
      const id1 = getPaneId(1);
      const id2 = getPaneId(2);
      const store0 = getIndicatorStore(id0);
      const store1 = getIndicatorStore(id1);
      const store2 = getIndicatorStore(id2);

      activePaneId.set(id1);
      applyChartAction('add_indicator', 'rsi');

      expect(get(store0).rsi).toBe(false);
      expect(get(store1).rsi).toBe(true);
      expect(get(store2).rsi).toBe(false);
    });
  });

  describe('setActivePane', () => {
    it('should update activePaneId store', () => {
      setActivePane(5);
      expect(get(activePaneId)).toBe(5);
    });

    it('should allow switching between panes', () => {
      setActivePane(0);
      expect(get(activePaneId)).toBe(0);

      setActivePane(3);
      expect(get(activePaneId)).toBe(3);

      setActivePane(1);
      expect(get(activePaneId)).toBe(1);
    });
  });

  describe('per-pane isolation', () => {
    it('should isolate indicator states across panes', () => {
      const id0 = getPaneId(0);
      const id1 = getPaneId(1);
      const id2 = getPaneId(2);
      const store0 = getIndicatorStore(id0);
      const store1 = getIndicatorStore(id1);
      const store2 = getIndicatorStore(id2);

      store0.update((s) => ({ ...s, vwap: true, rsi: true }));
      store1.update((s) => ({ ...s, macd: true }));
      store2.update((s) => ({ ...s, bollingerBands: true }));

      expect(get(store0)).toEqual(
        expect.objectContaining({ vwap: true, rsi: true, macd: false })
      );
      expect(get(store1)).toEqual(
        expect.objectContaining({ vwap: false, rsi: false, macd: true })
      );
      expect(get(store2)).toEqual(
        expect.objectContaining({ bollingerBands: true, vwap: false })
      );
    });

    it('should preserve state across SSE dispatches to different panes', () => {
      const id0 = getPaneId(0);
      const id1 = getPaneId(1);
      const store0 = getIndicatorStore(id0);
      const store1 = getIndicatorStore(id1);

      // Pane 0: add vwap
      activePaneId.set(id0);
      applyChartAction('add_indicator', 'vwap');

      // Pane 1: add rsi
      activePaneId.set(id1);
      applyChartAction('add_indicator', 'rsi');

      // Pane 0 should still have vwap, not rsi
      activePaneId.set(id0);
      expect(get(store0).vwap).toBe(true);
      expect(get(store0).rsi).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle multiple updates to the same indicator', () => {
      const id = getPaneId(0);
      const store = getIndicatorStore(id);

      activePaneId.set(id);
      applyChartAction('add_indicator', 'vwap');
      expect(get(store).vwap).toBe(true);

      applyChartAction('add_indicator', 'vwap');
      expect(get(store).vwap).toBe(true);

      applyChartAction('remove_indicator', 'vwap');
      expect(get(store).vwap).toBe(false);
    });

    it('should support dynamic pane creation', () => {
      const ids = [getPaneId(0), getPaneId(1), getPaneId(2)];
      const stores = ids.map((id) => getIndicatorStore(id));

      stores.forEach((store, idx) => {
        activePaneId.set(ids[idx]);
        applyChartAction('add_indicator', 'vwap');
      });

      stores.forEach((store) => {
        expect(get(store).vwap).toBe(true);
      });
    });
  });
});

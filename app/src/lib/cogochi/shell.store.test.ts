import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { get } from 'svelte/store';
import { shellStore, type Timeframe } from './shell.store';

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

describe('shell.store', () => {
  beforeEach(() => {
    mockLocalStorage.clear();
    shellStore.reset();
  });

  afterEach(() => {
    mockLocalStorage.clear();
  });

  it('should initialize with default state', () => {
    const state = get(shellStore);
    expect(state.activeTabId).toBeTruthy();
    expect(state.tabs.length).toBeGreaterThan(0);
    expect(state.sidebarVisible).toBe(true);
    expect(state.aiVisible).toBe(true);
  });

  it('should update symbol correctly', () => {
    shellStore.setSymbol('ETHUSDT');
    const state = get(shellStore);
    const activeTab = state.tabs.find(t => t.id === state.activeTabId);
    expect(activeTab?.tabState.symbol).toBe('ETHUSDT');
  });

  it('should update timeframe correctly', () => {
    shellStore.setTimeframe('1h');
    const state = get(shellStore);
    const activeTab = state.tabs.find(t => t.id === state.activeTabId);
    expect(activeTab?.tabState.timeframe).toBe('1h');
  });

  it('should support all timeframe values', () => {
    const timeframes: Timeframe[] = ['1m', '3m', '5m', '15m', '30m', '1h', '4h', '1D'];
    for (const tf of timeframes) {
      shellStore.setTimeframe(tf);
      const state = get(shellStore);
      const activeTab = state.tabs.find(t => t.id === state.activeTabId);
      expect(activeTab?.tabState.timeframe).toBe(tf);
    }
  });

  it('should toggle sidebar visibility', () => {
    const state1 = get(shellStore);
    const initialVisible = state1.sidebarVisible;
    shellStore.toggleSidebar();
    const state2 = get(shellStore);
    expect(state2.sidebarVisible).toBe(!initialVisible);
  });

  it('should toggle AI visibility', () => {
    const state1 = get(shellStore);
    const initialVisible = state1.aiVisible;
    shellStore.toggleAI();
    const state2 = get(shellStore);
    expect(state2.aiVisible).toBe(!initialVisible);
  });

  it('should have Timeframe type exported', () => {
    // Type check at compile time
    const tf: Timeframe = '4h';
    expect(tf).toBe('4h');
  });
});

/**
 * W-0322: Terminal layout store — theme × density × layout mode
 * Persisted to localStorage. Drives CSS data-attributes on root.
 */
import { writable, derived } from 'svelte/store';
import { browser } from '$app/environment';

export type TerminalTheme = 'dark' | 'deep' | 'neon' | 'muted';
export type TerminalDensity = 'compact' | 'cozy' | 'comfortable';
export type TerminalLayoutMode = '3rail' | '2rail' | 'focus';

interface TerminalLayoutState {
  theme: TerminalTheme;
  density: TerminalDensity;
  layoutMode: TerminalLayoutMode;
}

const STORAGE_KEY = 'wtd_terminal_layout';

function loadFromStorage(): TerminalLayoutState {
  if (!browser) return { theme: 'dark', density: 'cozy', layoutMode: '3rail' };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { theme: 'dark', density: 'cozy', layoutMode: '3rail' };
    return { theme: 'dark', density: 'cozy', layoutMode: '3rail', ...JSON.parse(raw) };
  } catch {
    return { theme: 'dark', density: 'cozy', layoutMode: '3rail' };
  }
}

function createTerminalLayoutStore() {
  const { subscribe, set, update } = writable<TerminalLayoutState>(loadFromStorage());

  function persist(state: TerminalLayoutState) {
    if (browser) localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return state;
  }

  return {
    subscribe,
    setTheme: (theme: TerminalTheme) =>
      update(s => persist({ ...s, theme })),
    setDensity: (density: TerminalDensity) =>
      update(s => persist({ ...s, density })),
    setLayoutMode: (layoutMode: TerminalLayoutMode) =>
      update(s => persist({ ...s, layoutMode })),
    reset: () => set(persist({ theme: 'dark', density: 'cozy', layoutMode: '3rail' })),
  };
}

export const terminalLayout = createTerminalLayoutStore();

/** Reactive CSS data-attribute values for binding to DOM root */
export const terminalThemeAttr    = derived(terminalLayout, s => s.theme);
export const terminalDensityAttr  = derived(terminalLayout, s => s.density);
export const terminalLayoutModeAttr = derived(terminalLayout, s => s.layoutMode);

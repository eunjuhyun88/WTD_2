/**
 * Terminal UI canonical state.
 *
 * Single source of truth for symbol, timeframe, and derived values.
 * Eliminates duplication across Header, CommandBar, VerdictPanel.
 * Synchronizes with activePairStore (bridge layer).
 *
 * W-0110-C: Consolidates ?symbol param + internal state fragmentation.
 */

import { writable, derived } from 'svelte/store';
import type { CanonicalTimeframe } from '$lib/utils/timeframe';
import { activePairState, setActivePair, setActiveTimeframe } from './activePairStore';
import { browser } from '$app/environment';

export interface TerminalState {
  activeSymbol: string;
  activeTimeframe: CanonicalTimeframe;
  last24hChangePct: number | null;
}

const SESSION_STORAGE_KEY = 'wtd.terminal.state.v1';
const DEFAULT_STATE: TerminalState = {
  activeSymbol: 'BTCUSDT',
  activeTimeframe: '1h',
  last24hChangePct: null,
};

function loadSessionState(): TerminalState {
  if (!browser) return { ...DEFAULT_STATE };
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STATE };
    const parsed = JSON.parse(raw) as Partial<TerminalState>;
    return { ...DEFAULT_STATE, ...parsed };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

function persistSessionState(state: TerminalState) {
  if (!browser) return;
  try {
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
      activeSymbol: state.activeSymbol,
      activeTimeframe: state.activeTimeframe,
    }));
  } catch {
    // quota / access error — non-fatal
  }
}

function createTerminalState() {
  const { subscribe, set, update } = writable<TerminalState>(loadSessionState());

  // Subscribe to all state changes and persist to sessionStorage (W-0114 Phase B)
  subscribe(state => persistSessionState(state));

  // Sync FROM activePairStore on init and when it changes
  if (typeof window !== 'undefined') {
    activePairState.subscribe(pairState => {
      update(ts => ({
        ...ts,
        activeSymbol: pairState.pair.replace('/', ''),
        activeTimeframe: pairState.timeframe,
      }));
    });
  }

  return {
    subscribe,
    setSymbol: (symbol: string) => {
      update(s => ({ ...s, activeSymbol: symbol }));
      // Sync TO activePairStore
      const base = symbol.slice(0, -4); // Remove USDT
      setActivePair(`${base}/USDT`);
    },
    setTimeframe: (tf: CanonicalTimeframe) => {
      update(s => ({ ...s, activeTimeframe: tf }));
      // Sync TO activePairStore
      setActiveTimeframe(tf);
    },
    setLast24hChange: (pct: number | null) => update(s => ({ ...s, last24hChangePct: pct })),
    reset: () => {
      set({
        activeSymbol: 'BTCUSDT',
        activeTimeframe: '1h',
        last24hChangePct: null,
      });
      setActivePair('BTC/USDT');
      setActiveTimeframe('1h');
    },
  };
}

export const terminalState = createTerminalState();

/**
 * Canonical symbol display name (reactive).
 */
export const canonicalSymbol = derived(terminalState, $state => $state.activeSymbol);

/**
 * Canonical timeframe (reactive).
 */
export const canonicalTimeframe = derived(terminalState, $state => $state.activeTimeframe);

/**
 * Canonical 24h change % from terminalState (no recalc in components).
 */
export const canonicalChange24h = derived(terminalState, $state => $state.last24hChangePct);

/**
 * Source label for terminal context (always "System" for canonical stores).
 */
export const canonicalSource = derived(terminalState, () => 'system');

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

export interface TerminalState {
  activeSymbol: string;
  activeTimeframe: CanonicalTimeframe;
  last24hChangePct: number | null;
}

function createTerminalState() {
  const { subscribe, set, update } = writable<TerminalState>({
    activeSymbol: 'BTCUSDT',
    activeTimeframe: '1h',
    last24hChangePct: null,
  });

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

/**
 * mobileMode.ts
 * Owns the active mode in the 4-tab mobile shell.
 * Serializes to URL query `?m=chart|detail|scan|judge`.
 * Note: 'detail' is the semantic name (DetailMode.svelte renders it); avoid
 * 'analyze' to match BottomTabBar/ModeRouter and the URL contract.
 * Only meaningful when viewportTier === 'MOBILE'.
 */

import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import { goto, replaceState } from '$app/navigation';

export type MobileMode = 'chart' | 'detail' | 'scan' | 'judge';

export interface MobileModeState {
  active: MobileMode;
  /** Symbol + timeframe context carried from chart into detail mode. */
  lastSymbolContext: { symbol: string; tf: string } | null;
  /** Set by JudgeMode row tap when jumping to ChartMode replay. */
  pendingAlertId: string | null;
}

const VALID_MODES = new Set<MobileMode>(['chart', 'detail', 'scan', 'judge']);

function parseMode(raw: string | null): MobileMode {
  if (raw && VALID_MODES.has(raw as MobileMode)) return raw as MobileMode;
  return 'chart';
}

function readInitialMode(): MobileMode {
  if (!browser) return 'chart';
  const params = new URLSearchParams(window.location.search);
  return parseMode(params.get('m'));
}

const initial: MobileModeState = {
  active: readInitialMode(),
  lastSymbolContext: null,
  pendingAlertId: null,
};

const _store = writable<MobileModeState>(initial);

function buildUrl(mode: MobileMode): string {
  if (!browser) return '';
  const url = new URL(window.location.href);
  url.searchParams.set('m', mode);
  return url.pathname + url.search;
}

export const mobileMode = {
  subscribe: _store.subscribe,

  setActive(mode: MobileMode, opts?: { symbol?: string; tf?: string; alertId?: string }) {
    _store.update((s) => ({
      ...s,
      active: mode,
      lastSymbolContext:
        opts?.symbol != null
          ? { symbol: opts.symbol, tf: opts.tf ?? s.lastSymbolContext?.tf ?? '1H' }
          : s.lastSymbolContext,
      pendingAlertId: opts?.alertId ?? null,
    }));

    if (browser) {
      replaceState(buildUrl(mode), history.state ?? {});
    }
  },

  goTo(mode: MobileMode, opts?: { symbol?: string; tf?: string; alertId?: string }) {
    _store.update((s) => ({
      ...s,
      active: mode,
      lastSymbolContext:
        opts?.symbol != null
          ? { symbol: opts.symbol, tf: opts.tf ?? s.lastSymbolContext?.tf ?? '1H' }
          : s.lastSymbolContext,
      pendingAlertId: opts?.alertId ?? null,
    }));

    if (browser) {
      void goto(buildUrl(mode), { replaceState: true, noScroll: true });
    }
  },
};

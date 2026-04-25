/**
 * chartIndicators.ts — single source of truth for which chart indicators are
 * active on the Terminal ChartBoard.
 *
 * W-0102 Slice 3: the store is shared so that:
 *   - ChartBoard reads from it to decide which overlays / sub-panes to render.
 *   - The SSE `chart_action` handler in /terminal toggles it when the LLM
 *     emits add_indicator / remove_indicator via the `chart_control` tool.
 *   - The user can still toggle from the in-chart studies popover (same API).
 *
 * The W-0102 decision pinned the pane budget to 5 slots (ChartBoard's existing
 * vol/rsi/macd/oi/cvd sub-pane DOM); `PANE_INDICATORS` enumerates the ones
 * that claim a sub-pane, so we can enforce that cap in one place.
 */

import { writable, get, derived } from 'svelte/store';
import type { Readable } from 'svelte/store';
import { browser } from '$app/environment';

export type IndicatorKey =
  // main-chart overlays
  | 'ema'
  | 'bb'
  | 'vwap'
  | 'atr_bands'
  | 'derivatives'
  // display-mode flag: opt-in to render funding+CVD ON the main chart (overlay)
  // rather than the default sub-pane. false = sub-pane (TradingView standard).
  | 'derivativesOverlay'
  // sub-pane indicators (compete for the 5 reserved slots)
  | 'cvd'
  | 'macd'
  | 'rsi'
  | 'oi'
  | 'volume'
  // W-0210 Layer 3: normalized comparison overlay (BTC or user-selected symbol)
  | 'comparison';

/** Indicators that occupy a sub-pane slot (not a main-chart overlay). */
export const PANE_INDICATORS: ReadonlyArray<IndicatorKey> = [
  'volume', 'cvd', 'macd', 'rsi', 'oi',
];

/** Cap per W-0102 decision — reuses ChartBoard's 5 reserved pane DOM refs. */
export const MAX_PANE_INDICATORS = 5;

export type ChartIndicatorState = Record<IndicatorKey, boolean>;

const DEFAULT_STATE: ChartIndicatorState = {
  ema: true,
  bb: false,
  vwap: false,
  atr_bands: false,
  derivatives: true,
  derivativesOverlay: false,  // sub-pane by default (TradingView standard)
  cvd: true,
  macd: false,
  rsi: false,
  oi: false,
  volume: true,
  comparison: false,          // W-0210 Layer 3: off by default
};

const STORAGE_KEY = 'wtd.chart.indicators.v1';

function loadPersisted(): ChartIndicatorState {
  if (!browser) return { ...DEFAULT_STATE };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STATE };
    const parsed = JSON.parse(raw) as Partial<ChartIndicatorState>;
    return { ...DEFAULT_STATE, ...parsed };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

function persist(state: ChartIndicatorState) {
  if (!browser) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // quota / access error — non-fatal
  }
}

const _store = writable<ChartIndicatorState>(loadPersisted());
_store.subscribe(persist);

export const chartIndicators: Readable<ChartIndicatorState> = {
  subscribe: _store.subscribe,
};

/** Normalize free-form indicator names from LLM tool calls. */
export function normalizeIndicatorKey(raw: string): IndicatorKey | null {
  const token = raw.trim().toLowerCase().replace(/[\s_-]/g, '');
  switch (token) {
    case 'ema': case 'movingaverage': case 'ma':
      return 'ema';
    case 'bb': case 'bollinger': case 'bollingerbands':
      return 'bb';
    case 'vwap':
      return 'vwap';
    case 'atr': case 'atrbands': case 'atrband':
      return 'atr_bands';
    case 'derivatives': case 'funding': case 'fundingbasis':
      return 'derivatives';
    case 'cvd': case 'delta': case 'cumulativedelta':
      return 'cvd';
    case 'macd':
      return 'macd';
    case 'rsi':
      return 'rsi';
    case 'oi': case 'openinterest':
      return 'oi';
    case 'volume': case 'vol':
      return 'volume';
    case 'comparison': case 'btc': case 'compare': case 'benchmark':
      return 'comparison';
    default:
      return null;
  }
}

function setIndicator(key: IndicatorKey, active: boolean) {
  _store.update((state) => {
    if (state[key] === active) return state;
    const next: ChartIndicatorState = { ...state, [key]: active };
    // Enforce sub-pane cap. If turning on a pane indicator pushes us past
    // MAX_PANE_INDICATORS, evict the oldest-enabled pane. Preserves user
    // intent ("add CVD") while respecting the budget.
    if (active && PANE_INDICATORS.includes(key)) {
      const activePanes = PANE_INDICATORS.filter((k) => next[k]);
      if (activePanes.length > MAX_PANE_INDICATORS) {
        for (const k of PANE_INDICATORS) {
          if (k !== key && next[k]) {
            next[k] = false;
            break;
          }
        }
      }
    }
    return next;
  });
}

/** Enable indicator (idempotent). Sub-pane cap evicts oldest if exceeded. */
export function addIndicator(key: IndicatorKey): void {
  setIndicator(key, true);
}

/** Disable indicator (idempotent). */
export function removeIndicator(key: IndicatorKey): void {
  setIndicator(key, false);
}

/** Toggle — convenience for click handlers. */
export function toggleIndicator(key: IndicatorKey): void {
  _store.update((state) => ({ ...state, [key]: !state[key] }));
}

/** Read a single indicator reactively. */
export function indicatorActive(key: IndicatorKey): Readable<boolean> {
  return derived(_store, (s) => s[key]);
}

/** Imperative snapshot (non-reactive). Useful in SSE handlers / logs. */
export function snapshotIndicators(): ChartIndicatorState {
  return { ...get(_store) };
}

/** Reset to defaults — debug / "clear all" action. */
export function resetIndicators(): void {
  _store.set({ ...DEFAULT_STATE });
}

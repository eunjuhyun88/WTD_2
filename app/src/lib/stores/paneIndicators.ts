// ═══════════════════════════════════════════════════════════════
// Per-Pane Indicator State Store
// ═══════════════════════════════════════════════════════════════
// W-0304: Per-pane indicator isolation for multichart mode.
// SSE chart_action routes to activePaneId store only.

import { writable, get, type Writable } from 'svelte/store';

export type IndicatorState = {
  vwap: boolean;
  sma20: boolean;
  ema50: boolean;
  rsi: boolean;
  macd: boolean;
  bollingerBands: boolean;
  // Legacy fields for compatibility
  [key: string]: boolean;
};

const DEFAULT_STATE: IndicatorState = {
  vwap: false,
  sma20: false,
  ema50: false,
  rsi: false,
  macd: false,
  bollingerBands: false,
};

const paneStores = new Map<number, Writable<IndicatorState>>();
export const activePaneId = writable<number>(0);

function loadFromStorage(paneId: number): IndicatorState {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_STATE };
  const raw = localStorage.getItem(`chart_indicators::pane_${paneId}`);
  if (!raw) return { ...DEFAULT_STATE };
  try {
    return { ...DEFAULT_STATE, ...JSON.parse(raw) as IndicatorState };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export function getIndicatorStore(paneId: number): Writable<IndicatorState> {
  if (!paneStores.has(paneId)) {
    const state = loadFromStorage(paneId);
    const store = writable<IndicatorState>(state);

    store.subscribe((v) => {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(`chart_indicators::pane_${paneId}`, JSON.stringify(v));
      }
    });

    paneStores.set(paneId, store);
  }

  return paneStores.get(paneId)!;
}

export function applyChartAction(
  action: 'add_indicator' | 'remove_indicator',
  name: keyof IndicatorState,
): void {
  const id = get(activePaneId);
  const store = getIndicatorStore(id);
  store.update((s) => ({
    ...s,
    [name]: action === 'add_indicator' ? true : false,
  }));
}

export function setActivePane(paneId: number): void {
  activePaneId.set(paneId);
}

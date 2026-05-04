// indicatorInstances — multi-instance chart indicator model (W-0399)
//
// Additive layer on top of the existing chartIndicators.ts boolean store.
// Handles the "add a second RSI with different params" use case.
// Single-instance Tier-A indicators are still managed by chartIndicators.ts.

import { browser } from '$app/environment';

// ── Types ──────────────────────────────────────────────────────────────────

export interface IndicatorInstance {
  instanceId: string;   // nanoid-style, e.g. "oi3xb2k9"
  defId: string;        // FK → indicatorRegistry IndicatorDef.id
  engineKey: string;    // chartIndicators IndicatorKey (e.g. 'rsi', 'macd')
  params: Record<string, number | string | boolean>;
  style: {
    color?: string;
    lineWidth?: 1 | 2 | 3;
    visible: boolean;
  };
  /** -1 = auto-assign next available pane */
  paneIndex: number;
  createdAt: number;
}

export interface IndicatorInstancesState {
  version: 1;
  instances: IndicatorInstance[];
}

// ── Storage ────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'wtd.chart.indicator-instances.v1';

function load(): IndicatorInstancesState {
  if (!browser) return { version: 1, instances: [] };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { version: 1, instances: [] };
    return JSON.parse(raw) as IndicatorInstancesState;
  } catch {
    return { version: 1, instances: [] };
  }
}

function persist(state: IndicatorInstancesState): void {
  if (!browser) return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* quota */ }
}

function nanoid8(): string {
  return Math.random().toString(36).slice(2, 10);
}

// ── Default params per engineKey ──────────────────────────────────────────

export function defaultParams(engineKey: string): Record<string, number | string | boolean> {
  switch (engineKey) {
    case 'rsi':       return { period: 14 };
    case 'macd':      return { fast: 12, slow: 26, signal: 9 };
    case 'ema':       return { period: 21 };
    case 'bb':        return { period: 20, mult: 2 };
    case 'vwap':      return {};
    case 'atr_bands': return { period: 14, mult: 2 };
    case 'volume':    return {};
    case 'oi':        return {};
    case 'cvd':       return {};
    case 'derivatives': return {};
    default:          return {};
  }
}

// ── Reactive store ─────────────────────────────────────────────────────────

let _state = $state<IndicatorInstancesState>(load());

export const indicatorInstances = {
  get instances(): IndicatorInstance[] { return _state.instances; },

  add(defId: string, engineKey: string, params: Record<string, number | string | boolean> = {}): string {
    const instanceId = nanoid8();
    _state.instances.push({
      instanceId,
      defId,
      engineKey,
      params: { ...defaultParams(engineKey), ...params },
      style: { visible: true },
      paneIndex: -1,
      createdAt: Date.now(),
    });
    persist(_state);
    return instanceId;
  },

  remove(instanceId: string): void {
    const i = _state.instances.findIndex((x) => x.instanceId === instanceId);
    if (i >= 0) { _state.instances.splice(i, 1); persist(_state); }
  },

  updateParams(instanceId: string, params: Record<string, number | string | boolean>): void {
    const inst = _state.instances.find((x) => x.instanceId === instanceId);
    if (inst) { inst.params = { ...inst.params, ...params }; persist(_state); }
  },

  /** How many instances exist for this defId (for "already added" badge count). */
  countByDef(defId: string): number {
    return _state.instances.filter((x) => x.defId === defId).length;
  },

  clear(): void {
    _state.instances.length = 0;
    persist(_state);
  },
};

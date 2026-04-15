import { writable } from 'svelte/store';

export interface PatternCaptureContext {
  symbol: string;
  slug: string;
  phase: string;
  phaseLabel?: string;
  patternSlug?: string;
  patternVersion?: number;
  timeframe?: string;
  transitionId?: string | null;
  candidateTransitionId?: string | null;
  scanId?: string | null;
  blockScores?: Record<string, unknown>;
  featureSnapshot?: Record<string, unknown> | null;
  seenAt?: number;
}

export interface PatternCaptureContextState {
  records: PatternCaptureContext[];
  selectedKey: string | null;
}

const initialState: PatternCaptureContextState = {
  records: [],
  selectedKey: null,
};

function makeKey(record: Pick<PatternCaptureContext, 'symbol' | 'slug' | 'candidateTransitionId' | 'transitionId'>): string {
  return `${record.slug}:${record.symbol}:${record.candidateTransitionId ?? record.transitionId ?? ''}`;
}

function normalizeRecords(records: PatternCaptureContext[]): PatternCaptureContext[] {
  return records.map((record) => ({
    ...record,
    seenAt: record.seenAt ?? Date.now(),
  }));
}

export function resolvePatternCaptureContext(
  state: PatternCaptureContextState,
  symbol: string,
  timeframe?: string,
): PatternCaptureContext | null {
  const selected = state.selectedKey
    ? state.records.find((record) => makeKey(record) === state.selectedKey)
    : null;
  if (selected && selected.symbol === symbol && (!timeframe || !selected.timeframe || selected.timeframe === timeframe)) {
    return selected;
  }
  return null;
}

function createPatternCaptureContextStore() {
  const { subscribe, set, update } = writable<PatternCaptureContextState>(initialState);

  return {
    subscribe,
    reset: () => set(initialState),
    clearSelection: () =>
      update((state) => ({
        ...state,
        selectedKey: null,
      })),
    setRecords: (records: PatternCaptureContext[]) =>
      update((state) => ({
        records: normalizeRecords(records),
        selectedKey: state.selectedKey,
      })),
    select: (record: PatternCaptureContext) =>
      update((state) => ({
        records: normalizeRecords(state.records),
        selectedKey: makeKey(record),
      })),
    resolve(symbol: string, timeframe?: string): PatternCaptureContext | null {
      let snapshot = initialState;
      const unsubscribe = subscribe((value) => {
        snapshot = value;
      });
      unsubscribe();
      return resolvePatternCaptureContext(snapshot, symbol, timeframe);
    },
  };
}

export const patternCaptureContextStore = createPatternCaptureContextStore();

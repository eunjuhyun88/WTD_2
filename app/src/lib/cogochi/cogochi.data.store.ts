// Shared reactive state for cogochi panels.
// TradeMode is the producer; AnalyzePanel/ScanPanel/JudgePanel are consumers.
import { writable, derived } from 'svelte/store';
import type { AnalyzeEnvelope } from '$lib/contracts/terminalBackend';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ScanCandidate {
  id: string;
  symbol: string;
  tf: string;
  pattern: string;
  phase: number;
  alpha: number;
  age: string;
  sim: number;
  dir: string;
}

export type PhaseState = 'done' | 'active' | 'pending';
export interface PhaseNode {
  label: string;
  state: PhaseState;
}

export interface DomRow {
  price: string;
  bid: string;
  ask: string;
  bidWidth: string;
  askWidth: string;
  delta: number;
  isMid: boolean;
}

export interface TimeSalesRow {
  time: string;
  side: 'BUY' | 'SELL';
  price: string;
  size: string;
  intensity: string;
}

export interface FootprintRow {
  price: string;
  bid: string;
  ask: string;
  delta: number;
  deltaLabel: string;
  width: string;
}

export interface HeatmapBand {
  price: string;
  intensity: number;
  widthPct: string;
}

// ─── Store state ──────────────────────────────────────────────────────────────

interface CogochiDataState {
  analyzeData: AnalyzeEnvelope | null;
  scanCandidates: ScanCandidate[];
  scanLoading: boolean;
  phaseTimeline: PhaseNode[];
  domLadderRows: DomRow[];
  timeSalesRows: TimeSalesRow[];
  footprintRows: FootprintRow[];
  heatmapRows: HeatmapBand[];
}

function makeDefault(): CogochiDataState {
  return {
    analyzeData: null,
    scanCandidates: [],
    scanLoading: false,
    phaseTimeline: [],
    domLadderRows: [],
    timeSalesRows: [],
    footprintRows: [],
    heatmapRows: [],
  };
}

const _store = writable<CogochiDataState>(makeDefault());

export const cogochiDataStore = {
  subscribe: _store.subscribe,

  setAnalyzeData(data: AnalyzeEnvelope | null) {
    _store.update(s => ({ ...s, analyzeData: data }));
  },

  setScanCandidates(items: ScanCandidate[], loading = false) {
    _store.update(s => ({ ...s, scanCandidates: items, scanLoading: loading }));
  },

  setScanLoading(loading: boolean) {
    _store.update(s => ({ ...s, scanLoading: loading }));
  },

  setPhaseTimeline(nodes: PhaseNode[]) {
    _store.update(s => ({ ...s, phaseTimeline: nodes }));
  },

  setMicrostructure(dom: DomRow[], tape: TimeSalesRow[], fp: FootprintRow[], hm: HeatmapBand[]) {
    _store.update(s => ({
      ...s,
      domLadderRows: dom,
      timeSalesRows: tape,
      footprintRows: fp,
      heatmapRows: hm,
    }));
  },

  reset() {
    _store.set(makeDefault());
  },
};

// ─── Derived selectors ────────────────────────────────────────────────────────

export const analyzeData = derived(_store, $s => $s.analyzeData);
export const scanCandidates = derived(_store, $s => $s.scanCandidates);
export const scanLoading = derived(_store, $s => $s.scanLoading);
export const phaseTimeline = derived(_store, $s => $s.phaseTimeline);
export const domLadderRows = derived(_store, $s => $s.domLadderRows);

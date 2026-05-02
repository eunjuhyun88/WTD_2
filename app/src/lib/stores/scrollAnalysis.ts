/**
 * Scroll segment analysis store (W-0384).
 * Triggered by chart scroll events or AI Agent /similar command.
 */
import { writable, derived } from 'svelte/store';

export interface AlphaSignal {
  dimension: string;
  score_delta: number;
  label: string;
  raw_value: number;
  threshold_used: number;
}

export interface AlphaScore {
  symbol: string;
  score: number;
  verdict: 'STRONG_ALPHA' | 'ALPHA' | 'WATCH' | 'NEUTRAL' | 'AVOID';
  signals: AlphaSignal[];
  computed_at: string;
  data_freshness_s: number;
}

export interface AnomalyFlag {
  ts: string;
  dimension: string;
  severity: 'high' | 'medium' | 'low';
  description: string;
  z_score: number;
}

export interface ScrollSegment {
  symbol: string;
  from_ts: string;
  to_ts: string;
  timeframe: string;
  n_bars: number;
  indicator_snapshot: Record<string, number>;
  anomaly_flags: AnomalyFlag[];
}

export interface SimilarSegment {
  symbol: string;
  from_ts: string;
  to_ts: string;
  similarity_score: number;
  layer_scores: { feature: number; sequence: number; ml: number };
  forward_pnl_1h: number | null;
  forward_pnl_4h: number | null;
  forward_pnl_24h: number | null;
  outcome: string | null;
  explanation: string;
}

export interface SimilarResult {
  similar_segments: SimilarSegment[];
  win_rate: number | null;
  avg_pnl: number | null;
  confidence: 'high' | 'medium' | 'low';
  run_id: string;
}

export interface ScrollAnalysisResult {
  segment: ScrollSegment;
  alpha_score: AlphaScore;
  similar: SimilarResult;
}

interface ScrollAnalysisState {
  isOpen: boolean;
  isLoading: boolean;
  request: { symbol: string; fromTs: string; toTs: string; timeframe: string } | null;
  result: ScrollAnalysisResult | null;
  error: string | null;
}

const _initial: ScrollAnalysisState = {
  isOpen: false,
  isLoading: false,
  request: null,
  result: null,
  error: null,
};

const _store = writable<ScrollAnalysisState>(_initial);

export const scrollAnalysis = {
  subscribe: _store.subscribe,

  trigger(symbol: string, fromTs: string, toTs: string, timeframe = '1h') {
    _store.update((s) => ({
      ...s,
      isOpen: true,
      isLoading: true,
      request: { symbol, fromTs, toTs, timeframe },
      result: null,
      error: null,
    }));

    const params = new URLSearchParams({ symbol, from_ts: fromTs, to_ts: toTs, timeframe });
    fetch(`/api/cogochi/alpha/scroll?${params}`)
      .then((r) => r.json())
      .then((data: ScrollAnalysisResult) => {
        _store.update((s) => ({ ...s, isLoading: false, result: data }));
      })
      .catch((err) => {
        _store.update((s) => ({
          ...s,
          isLoading: false,
          error: err?.message ?? 'Failed to load segment analysis',
        }));
      });
  },

  close() {
    _store.update((s) => ({ ...s, isOpen: false }));
  },

  reset() {
    _store.set(_initial);
  },
};

export const isScrollAnalysisOpen = derived(_store, ($s) => $s.isOpen);
